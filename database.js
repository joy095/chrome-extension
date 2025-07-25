// Cloudflare D1 Database Connection
class CloudflareD1DB {
  constructor() {
    // Replace with your actual Cloudflare Worker URL
    this.workerUrl =
      "https://website-blocker-worker.joykarmakar987654321.workers.dev";
    this.userId = this.getUserId();
    this.isConnected = false;
  }

  // Get or generate user ID
  getUserId() {
    let userId = localStorage.getItem("userId");
    if (!userId) {
      userId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("userId", userId);
    }
    return userId;
  }

  // Test connection to Cloudflare Worker
  async connect() {
    try {
      const response = await fetch(`${this.workerUrl}/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        this.isConnected = true;
        console.log("Cloudflare D1 database connected successfully");
        return true;
      } else {
        throw new Error("Connection failed");
      }
    } catch (error) {
      console.error("Cloudflare D1 database connection failed:", error);
      this.isConnected = false;
      return false;
    }
  }

  // Execute a database query
  async query(sql, params = []) {
    try {
      const response = await fetch(`${this.workerUrl}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: sql,
          params: params,
          userId: this.userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Database query failed:", error);
      throw error;
    }
  }

  // Initialize database tables
  async initializeTables() {
    try {
      // Create categories table
      await this.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          icon TEXT DEFAULT '🌐',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create blocked_sites table
      await this.query(`
        CREATE TABLE IF NOT EXISTS blocked_sites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          url_pattern TEXT NOT NULL,
          category_id INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create settings table
      await this.query(`
        CREATE TABLE IF NOT EXISTS settings (
          user_id TEXT PRIMARY KEY,
          enabled INTEGER DEFAULT 1,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log("Database tables initialized");
      return true;
    } catch (error) {
      console.error("Error initializing tables:", error);
      return false;
    }
  }

  // Get all categories for user
  async getCategories() {
    try {
      const result = await this.query(
        "SELECT * FROM categories WHERE user_id = ? ORDER BY name",
        [this.userId]
      );
      return result.results || [];
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  }

  // Get all blocked sites for user
  async getBlockedSites() {
    try {
      const result = await this.query(
        `SELECT bs.*, c.display_name as category_name 
         FROM blocked_sites bs 
         LEFT JOIN categories c ON bs.category_id = c.id 
         WHERE bs.user_id = ? 
         ORDER BY bs.created_at DESC`,
        [this.userId]
      );
      return result.results || [];
    } catch (error) {
      console.error("Error fetching blocked sites:", error);
      return [];
    }
  }

  // Add a new category
  async addCategory(name, displayName, icon = "🌐") {
    try {
      const result = await this.query(
        "INSERT INTO categories (user_id, name, display_name, icon) VALUES (?, ?, ?, ?) RETURNING *",
        [this.userId, name, displayName, icon]
      );
      return result.results[0] || null;
    } catch (error) {
      console.error("Error adding category:", error);
      return null;
    }
  }

  // Add a blocked site
  async addBlockedSite(urlPattern, categoryId) {
    try {
      const result = await this.query(
        "INSERT INTO blocked_sites (user_id, url_pattern, category_id) VALUES (?, ?, ?) RETURNING *",
        [this.userId, urlPattern, categoryId]
      );
      return result.results[0] || null;
    } catch (error) {
      console.error("Error adding blocked site:", error);
      return null;
    }
  }

  // Delete a blocked site
  async deleteBlockedSite(id) {
    try {
      await this.query(
        "DELETE FROM blocked_sites WHERE id = ? AND user_id = ?",
        [id, this.userId]
      );
      return true;
    } catch (error) {
      console.error("Error deleting blocked site:", error);
      return false;
    }
  }

  // Update setting
  async updateSetting(key, value) {
    if (key !== "enabled") return false;

    try {
      await this.query(
        `INSERT INTO settings (user_id, enabled) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET enabled = ?, updated_at = CURRENT_TIMESTAMP`,
        [this.userId, value ? 1 : 0, value ? 1 : 0]
      );
      return true;
    } catch (error) {
      console.error("Error updating setting:", error);
      return false;
    }
  }

  // Get setting
  async getSetting(key) {
    if (key !== "enabled") return null;

    try {
      const result = await this.query(
        "SELECT enabled FROM settings WHERE user_id = ?",
        [this.userId]
      );

      if (result.results && result.results.length > 0) {
        return result.results[0].enabled === 1;
      }
      return null;
    } catch (error) {
      console.error("Error getting setting:", error);
      return null;
    }
  }

  // Populate with default data if empty
  async populateDefaultData() {
    try {
      const categories = await this.getCategories();
      if (categories.length === 0) {
        // Add default categories with icons
        await this.addCategory("adult", "Adult Content", "🔞");
        await this.addCategory("entertainment", "Entertainment", "🎬");
        await this.addCategory("social", "Social Media", "📱");
        await this.addCategory("blogger", "Blogger Sites", "📝");

        // Add default sites
        const allCategories = await this.getCategories();
        const categoryMap = {};
        allCategories.forEach((cat) => {
          categoryMap[cat.name] = cat.id;
        });

        await this.addBlockedSite("*://*porn*.com/*", categoryMap.adult);
        await this.addBlockedSite("*://*sex*.com/*", categoryMap.adult);
        await this.addBlockedSite(
          "*://*youtube.com/*",
          categoryMap.entertainment
        );
        await this.addBlockedSite(
          "*://*netflix.com/*",
          categoryMap.entertainment
        );
        await this.addBlockedSite("*://*facebook.com/*", categoryMap.social);
        await this.addBlockedSite("*://*instagram.com/*", categoryMap.social);
        await this.addBlockedSite("*://*blogspot.com/*", categoryMap.blogger);
        await this.addBlockedSite("*://*wordpress.com/*", categoryMap.blogger);
      }

      // Check if setting exists
      const enabled = await this.getSetting("enabled");
      if (enabled === null) {
        await this.updateSetting("enabled", true);
      }

      return true;
    } catch (error) {
      console.error("Error populating default data:", error);
      return false;
    }
  }
}

// Initialize database connection
const cloudDB = new CloudflareD1DB();
