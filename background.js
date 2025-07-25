// Import database module
importScripts("database.js");

// Cache management functions
async function cacheData(key, data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: data }, resolve);
  });
}

async function getCachedData(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

// Initialize blocking rules
async function initializeBlocking() {
  try {
    // Try to connect to Cloudflare D1 database
    const isConnected = await cloudDB.connect();

    if (isConnected) {
      // Initialize tables
      await cloudDB.initializeTables();

      // Populate with default data if needed
      await cloudDB.populateDefaultData();

      // Load from cloud database
      await loadFromCloud();
    } else {
      // Fallback to cached data
      await loadFromCache();
    }
  } catch (error) {
    console.error("Error initializing blocking:", error);
    // Fallback to cached data
    await loadFromCache();
  }
}

// Load data from cloud database
async function loadFromCloud() {
  try {
    const [categories, sites, enabled] = await Promise.all([
      cloudDB.getCategories(),
      cloudDB.getBlockedSites(),
      cloudDB.getSetting("enabled"),
    ]);

    // Cache the data
    await cacheData("categories", categories);
    await cacheData("blockedSites", sites);
    await cacheData("enabled", enabled !== null ? enabled : true);

    // Update blocking rules
    if (enabled !== false) {
      await updateBlockingRules(sites);
    }
  } catch (error) {
    console.error("Error loading from cloud:", error);
  }
}

// Load data from cache
async function loadFromCache() {
  try {
    const [categories, sites, enabled] = await Promise.all([
      getCachedData("categories"),
      getCachedData("blockedSites"),
      getCachedData("enabled"),
    ]);

    if (categories && sites) {
      if (enabled !== false) {
        await updateBlockingRules(sites);
      }
    } else {
      // Load default data if nothing in cache
      await loadDefaultData();
    }
  } catch (error) {
    console.error("Error loading from cache:", error);
    await loadDefaultData();
  }
}

// Load default data
async function loadDefaultData() {
  const defaultCategories = [
    { id: 1, name: "adult", display_name: "Adult Content", icon: "🔞" },
    { id: 2, name: "entertainment", display_name: "Entertainment", icon: "🎬" },
    { id: 3, name: "social", display_name: "Social Media", icon: "📱" },
    { id: 4, name: "blogger", display_name: "Blogger Sites", icon: "📝" },
  ];

  const defaultSites = [
    {
      id: 1,
      url_pattern: "*://*porn*.com/*",
      category_id: 1,
      category_name: "Adult Content",
    },
    {
      id: 2,
      url_pattern: "*://*sex*.com/*",
      category_id: 1,
      category_name: "Adult Content",
    },
    {
      id: 3,
      url_pattern: "*://*youtube.com/*",
      category_id: 2,
      category_name: "Entertainment",
    },
    {
      id: 4,
      url_pattern: "*://*facebook.com/*",
      category_id: 3,
      category_name: "Social Media",
    },
    {
      id: 5,
      url_pattern: "*://*instagram.com/*",
      category_id: 3,
      category_name: "Social Media",
    },
    {
      id: 6,
      url_pattern: "*://*blogspot.com/*",
      category_id: 4,
      category_name: "Blogger Sites",
    },
  ];

  await cacheData("categories", defaultCategories);
  await cacheData("blockedSites", defaultSites);
  await cacheData("enabled", true);

  await updateBlockingRules(defaultSites);
}

// Update blocking rules based on sites
async function updateBlockingRules(sites = null) {
  try {
    // If sites not provided, get from cache
    if (!sites) {
      sites = await getCachedData("blockedSites");
      if (!sites) return;
    }

    const patterns = sites.map((site) => site.url_pattern);

    if (patterns.length === 0) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: [],
      });
      return;
    }

    const rules = [
      {
        id: 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: chrome.runtime.getURL("blocked.html") },
        },
        condition: {
          urlFilter: "*",
          resourceTypes: ["main_frame"],
          regexFilter: patterns
            .map((p) => p.replace(/\*/g, ".*").replace(/\./g, "\\."))
            .join("|"),
        },
      },
    ];

    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: rules,
    });
  } catch (error) {
    console.error("Error updating blocking rules:", error);
  }
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener(initializeBlocking);

// Listen for storage changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === "local") {
    if (changes.enabled) {
      // Update cloud setting
      if (cloudDB.isConnected) {
        await cloudDB.updateSetting("enabled", changes.enabled.newValue);
      }

      if (changes.enabled.newValue) {
        const sites = await getCachedData("blockedSites");
        await updateBlockingRules(sites);
      } else {
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [1],
          addRules: [],
        });
      }
    }
  }
});

// Listen for messages from popup/options
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "updateBlocking") {
    const sites = await getCachedData("blockedSites");
    await updateBlockingRules(sites);
    sendResponse({ success: true });
  } else if (request.action === "toggleBlocking") {
    const enabled = request.enabled;
    await cacheData("enabled", enabled);

    // Update cloud setting
    if (cloudDB.isConnected) {
      await cloudDB.updateSetting("enabled", enabled);
    }

    if (enabled) {
      const sites = await getCachedData("blockedSites");
      await updateBlockingRules(sites);
    } else {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: [],
      });
    }
    sendResponse({ success: true });
  } else if (request.action === "saveSites") {
    try {
      await cacheData("blockedSites", request.sites);

      // Update cloud database
      if (cloudDB.isConnected) {
        // In a real implementation, you would sync changes to cloud
      }

      await updateBlockingRules(request.sites);
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error saving sites:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "addBlockedSite") {
    try {
      if (cloudDB.isConnected) {
        const result = await cloudDB.addBlockedSite(
          request.urlPattern,
          request.categoryId
        );
        if (result) {
          // Refresh cached data
          const sites = await cloudDB.getBlockedSites();
          await cacheData("blockedSites", sites);
          await updateBlockingRules(sites);
          sendResponse({ success: true, site: result });
        } else {
          sendResponse({ success: false, error: "Failed to add site" });
        }
      } else {
        sendResponse({
          success: false,
          error: "Not connected to cloud database",
        });
      }
    } catch (error) {
      console.error("Error adding blocked site:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "deleteBlockedSite") {
    try {
      if (cloudDB.isConnected) {
        const result = await cloudDB.deleteBlockedSite(request.id);
        if (result) {
          // Refresh cached data
          const sites = await cloudDB.getBlockedSites();
          await cacheData("blockedSites", sites);
          await updateBlockingRules(sites);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Failed to delete site" });
        }
      } else {
        sendResponse({
          success: false,
          error: "Not connected to cloud database",
        });
      }
    } catch (error) {
      console.error("Error deleting blocked site:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Required for async response
});
