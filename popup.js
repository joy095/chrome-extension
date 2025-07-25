document.addEventListener("DOMContentLoaded", async () => {
  const categoriesDiv = document.getElementById("categories");
  const masterToggle = document.getElementById("masterToggle");
  const settingsBtn = document.getElementById("settingsBtn");
  const whitelistBtn = document.getElementById("whitelistBtn");
  const statusDiv = document.getElementById("status");
  const connectionStatus = document.getElementById("connectionStatus");

  // Check connection status
  try {
    const response = await fetch(
      "https://website-blocker-worker.joykarmakar987654321.workers.dev/health"
    );
    if (response.ok) {
      connectionStatus.textContent = "✓ Connected to cloud database";
      connectionStatus.className = "connection-status connected";
    } else {
      throw new Error("Connection failed");
    }
  } catch (error) {
    connectionStatus.textContent = "⚠ Cloud connection unavailable";
    connectionStatus.className = "connection-status disconnected";
  }

  // Load current settings
  chrome.storage.local.get(["enabled"], (result) => {
    masterToggle.checked = result.enabled !== false;
    updateStatus(result.enabled !== false);
  });

  // Load categories
  try {
    const result = await chrome.storage.local.get(["categories"]);
    const categories = result.categories || [];

    if (categories.length > 0) {
      categoriesDiv.innerHTML = "";
      categories.forEach((category) => {
        const div = document.createElement("div");
        div.className = "category";
        div.innerHTML = `
          <div class="category-header">
            <div class="category-header-main">
              <div class="category-icon">${category.icon || "🌐"}</div>
              <h3>${category.display_name || category.displayName}</h3>
            </div>
            <div class="sites-count">Loading...</div>
          </div>
          <div class="category-content">
            <div class="sites-list">Loading blocked sites...</div>
          </div>
        `;

        const header = div.querySelector(".category-header");
        const content = div.querySelector(".category-content");
        const sitesCount = div.querySelector(".sites-count");
        const sitesList = div.querySelector(".sites-list");

        header.addEventListener("click", () => {
          content.classList.toggle("active");
          if (
            content.classList.contains("active") &&
            sitesList.textContent === "Loading blocked sites..."
          ) {
            loadBlockedSites(category.id, sitesList, sitesCount);
          }
        });

        categoriesDiv.appendChild(div);

        // Load sites count
        loadSitesCount(category.id, sitesCount);
      });
    } else {
      categoriesDiv.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>No categories found</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading categories:", error);
    categoriesDiv.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 9V11M12 15H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Error loading categories</p>
      </div>
    `;
  }

  // Load sites count for a category
  async function loadSitesCount(categoryId, countElement) {
    try {
      const result = await chrome.storage.local.get(["blockedSites"]);
      const sites = result.blockedSites || [];
      const count = sites.filter(
        (site) => site.category_id == categoryId
      ).length;
      countElement.textContent = `${count} sites`;
    } catch (error) {
      countElement.textContent = "Error";
    }
  }

  // Load blocked sites for a category
  async function loadBlockedSites(categoryId, listElement, countElement) {
    try {
      const result = await chrome.storage.local.get(["blockedSites"]);
      const sites = result.blockedSites || [];
      const categorySites = sites.filter(
        (site) => site.category_id == categoryId
      );

      if (categorySites.length > 0) {
        listElement.innerHTML = `
          <div style="margin-top: 15px;">
            ${categorySites
              .slice(0, 5)
              .map(
                (site) =>
                  `<div style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div style="word-break: break-all; font-size: 13px;">${site.url_pattern}</div>
                <button class="delete-site" data-id="${site.id}" style="background: none; border: none; color: #ef476f; cursor: pointer; font-size: 16px;">×</button>
              </div>`
              )
              .join("")}
            ${
              categorySites.length > 5
                ? `<div style="padding: 8px 0; text-align: center; color: #6c757d; font-size: 13px;">... and ${
                    categorySites.length - 5
                  } more</div>`
                : ""
            }
          </div>
        `;

        // Add event listeners to delete buttons
        listElement.querySelectorAll(".delete-site").forEach((button) => {
          button.addEventListener("click", async (e) => {
            e.stopPropagation();
            const siteId = parseInt(button.getAttribute("data-id"));
            if (confirm("Are you sure you want to delete this blocked site?")) {
              chrome.runtime.sendMessage(
                {
                  action: "deleteBlockedSite",
                  id: siteId,
                },
                (response) => {
                  if (response.success) {
                    button.closest("div").remove();
                    loadSitesCount(categoryId, countElement);
                  } else {
                    alert("Error deleting site: " + response.error);
                  }
                }
              );
            }
          });
        });
      } else {
        listElement.innerHTML =
          '<p style="color:#6c757d;margin:15px 0;text-align:center;">No blocked sites in this category</p>';
      }

      countElement.textContent = `${categorySites.length} sites`;
    } catch (error) {
      listElement.innerHTML =
        '<p style="color:#ef476f;margin:15px 0;text-align:center;">Error loading sites</p>';
    }
  }

  // Master toggle handler
  masterToggle.addEventListener("change", async () => {
    const enabled = masterToggle.checked;
    chrome.storage.local.set({ enabled });

    // Notify background script
    chrome.runtime.sendMessage({
      action: "toggleBlocking",
      enabled: enabled,
    });

    updateStatus(enabled);
  });

  // Settings button
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Whitelist button
  whitelistBtn.addEventListener("click", () => {
    alert("Whitelist feature coming soon!");
  });

  function updateStatus(enabled) {
    statusDiv.textContent = enabled
      ? "Blocking is ACTIVE"
      : "Blocking is INACTIVE";
    statusDiv.className = "status " + (enabled ? "active" : "inactive");
  }
});
