document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("categories-container");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const status = document.getElementById("status");
  const connectionStatus = document.getElementById("connectionStatus");
  const totalSitesEl = document.getElementById("totalSites");
  const totalCategoriesEl = document.getElementById("totalCategories");
  const statusIndicator = document.getElementById("statusIndicator");

  // Check connection status
  try {
    const response = await fetch(
      "https://website-blocker-worker.joykarmakar987654321.workers.dev/health"
    );
    if (response.ok) {
      connectionStatus.textContent = "✓ Connected to Cloudflare D1 database";
      connectionStatus.className = "connection-status connected";
    } else {
      throw new Error("Connection failed");
    }
  } catch (error) {
    connectionStatus.textContent =
      "⚠ Cloud connection unavailable - using local cache";
    connectionStatus.className = "connection-status disconnected";
  }

  // Default categories and sites
  const defaultCategories = [
    {
      id: "adult",
      name: "Adult Content",
      icon: "🔞",
      sites: [
        "*://*porn*.com/*",
        "*://*sex*.com/*",
        "*://*adult*.com/*",
        "*://*xxx*.com/*",
        "*://*cam*.com/*",
      ],
    },
    {
      id: "entertainment",
      name: "Entertainment",
      icon: "🎬",
      sites: [
        "*://*youtube.com/*",
        "*://*netflix.com/*",
        "*://*hulu.com/*",
        "*://*disneyplus.com/*",
        "*://*hbo.com/*",
      ],
    },
    {
      id: "social",
      name: "Social Media",
      icon: "📱",
      sites: [
        "*://*facebook.com/*",
        "*://*instagram.com/*",
        "*://*twitter.com/*",
        "*://*tiktok.com/*",
        "*://*snapchat.com/*",
      ],
    },
    {
      id: "blogger",
      name: "Blogger Sites",
      icon: "📝",
      sites: [
        "*://*blogspot.com/*",
        "*://*wordpress.com/*",
        "*://*medium.com/*",
        "*://*tumblr.com/*",
        "*://*blogger.com/*",
      ],
    },
  ];

  // Load current configuration
  let currentConfig = [];
  try {
    const result = await chrome.storage.local.get(["blockerConfig"]);
    currentConfig = result.blockerConfig || defaultCategories;
  } catch (error) {
    console.error("Error loading config:", error);
    currentConfig = defaultCategories;
  }

  // Update stats
  updateStats(currentConfig);

  // Create UI for each category
  currentConfig.forEach((category) => {
    const div = document.createElement("div");
    div.className = "category";
    div.innerHTML = `
      <div class="category-header">
        <div class="category-header-main">
          <div class="category-icon">${category.icon || "🌐"}</div>
          <h3>${category.name}</h3>
        </div>
      </div>
      <div class="category-content">
        <textarea id="${
          category.id
        }" placeholder="Enter one URL pattern per line...">${category.sites.join(
      "\n"
    )}</textarea>
        <div class="button-group">
          <button class="btn-primary add-pattern" data-category="${
            category.id
          }">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Add Pattern
          </button>
          <button class="btn-danger clear-category" data-category="${
            category.id
          }">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Clear All
          </button>
        </div>
      </div>
    `;
    container.appendChild(div);

    // Add event listeners
    const header = div.querySelector(".category-header");
    const content = div.querySelector(".category-content");

    header.addEventListener("click", () => {
      content.classList.toggle("active");
    });

    const addPatternBtn = div.querySelector(".add-pattern");
    addPatternBtn.addEventListener("click", () => {
      const textarea = document.getElementById(category.id);
      const currentText = textarea.value.trim();
      textarea.value = currentText ? currentText + "\n" : "";
      textarea.focus();
    });

    const clearBtn = div.querySelector(".clear-category");
    clearBtn.addEventListener("click", () => {
      if (
        confirm(`Are you sure you want to clear all sites in ${category.name}?`)
      ) {
        document.getElementById(category.id).value = "";
      }
    });
  });

  // Save settings
  saveBtn.addEventListener("click", async () => {
    try {
      const newConfig = currentConfig.map((category) => {
        const textarea = document.getElementById(category.id);
        const sites = textarea.value
          .split("\n")
          .map((url) => url.trim())
          .filter((url) => url.length > 0);
        return { ...category, sites };
      });

      await chrome.storage.local.set({ blockerConfig: newConfig });

      // Convert to database format
      const dbSites = [];
      const categoryMap = {
        adult: 1,
        entertainment: 2,
        social: 3,
        blogger: 4,
      };

      newConfig.forEach((category) => {
        const categoryId = categoryMap[category.id] || 0;
        category.sites.forEach((urlPattern) => {
          dbSites.push({
            url_pattern: urlPattern,
            category_id: categoryId,
          });
        });
      });

      // Save to storage
      await chrome.storage.local.set({ blockedSites: dbSites });

      // Notify background to update rules
      chrome.runtime.sendMessage({ action: "updateBlocking" });

      showStatus("Settings saved successfully!", "success");
      updateStats(newConfig);
    } catch (error) {
      console.error("Error saving settings:", error);
      showStatus("Error saving settings. Please try again.", "error");
    }
  });

  // Reset to defaults
  resetBtn.addEventListener("click", async () => {
    if (
      confirm(
        "Are you sure you want to reset to default settings? This will remove all custom blocked sites."
      )
    ) {
      try {
        await chrome.storage.local.set({ blockerConfig: defaultCategories });

        // Reload the page to show defaults
        location.reload();
      } catch (error) {
        console.error("Error resetting settings:", error);
        showStatus("Error resetting settings. Please try again.", "error");
      }
    }
  });

  // Export configuration
  exportBtn.addEventListener("click", async () => {
    try {
      const result = await chrome.storage.local.get(["blockerConfig"]);
      const config = result.blockerConfig || defaultCategories;

      const dataStr = JSON.stringify(config, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(dataBlob);
      link.download = "website-blocker-config.json";
      link.click();

      showStatus("Configuration exported successfully!", "success");
    } catch (error) {
      console.error("Error exporting config:", error);
      showStatus("Error exporting configuration. Please try again.", "error");
    }
  });

  // Import configuration
  importBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const config = JSON.parse(e.target.result);

            // Validate configuration
            if (!Array.isArray(config)) {
              throw new Error("Invalid configuration format");
            }

            await chrome.storage.local.set({ blockerConfig: config });
            location.reload();
          } catch (error) {
            console.error("Error importing config:", error);
            showStatus(
              "Invalid configuration file. Please check the format.",
              "error"
            );
          }
        };
        reader.readAsText(file);
      } catch (error) {
        console.error("Error reading file:", error);
        showStatus("Error reading file. Please try again.", "error");
      }
    };

    input.click();
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    setTimeout(() => {
      status.className = "";
    }, 3000);
  }

  function updateStats(config) {
    const totalSites = config.reduce(
      (sum, category) => sum + category.sites.length,
      0
    );
    totalSitesEl.textContent = totalSites;
    totalCategoriesEl.textContent = config.length;

    chrome.storage.local.get(["enabled"], (result) => {
      statusIndicator.textContent = result.enabled !== false ? "✓" : "✗";
      statusIndicator.style.color =
        result.enabled !== false ? "#06d6a0" : "#ef476f";
    });
  }
});
