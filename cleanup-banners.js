#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Banner Cleanup Utility
 * 
 * This script cleans up orphaned banner files that are no longer
 * referenced by any server in the database.
 */

class BannerCleanup {
  constructor() {
    this.dbPath = path.join(__dirname, 'data.sqlite3');
    this.uploadsDir = path.join(__dirname, 'public', 'uploads');
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Error connecting to database:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to database');
          resolve();
        }
      });
    });
  }

  async getReferencedBanners() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT banner_url FROM servers WHERE banner_url IS NOT NULL';
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const banners = rows
            .map(row => row.banner_url)
            .filter(url => url)
            .map(url => path.basename(url));
          resolve(new Set(banners));
        }
      });
    });
  }

  async getUploadedFiles() {
    if (!fs.existsSync(this.uploadsDir)) {
      console.log('📁 Uploads directory does not exist');
      return new Set();
    }

    try {
      const files = fs.readdirSync(this.uploadsDir);
      // Filter for image files only
      const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);
      });
      return new Set(imageFiles);
    } catch (error) {
      console.error('❌ Error reading uploads directory:', error.message);
      return new Set();
    }
  }

  async cleanupOrphanedBanners(dryRun = false) {
    try {
      const referencedBanners = await this.getReferencedBanners();
      const uploadedFiles = await this.getUploadedFiles();

      console.log(`📊 Found ${referencedBanners.size} referenced banners`);
      console.log(`📊 Found ${uploadedFiles.size} uploaded files`);

      const orphanedFiles = [...uploadedFiles].filter(file => 
        !referencedBanners.has(file)
      );

      if (orphanedFiles.length === 0) {
        console.log('✅ No orphaned banner files found');
        return { deleted: 0, errors: 0 };
      }

      console.log(`🗑️  Found ${orphanedFiles.length} orphaned files:`);
      
      let deleted = 0;
      let errors = 0;

      for (const file of orphanedFiles) {
        const filePath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        
        console.log(`  - ${file} (${sizeKB} KB)`);

        if (!dryRun) {
          try {
            fs.unlinkSync(filePath);
            deleted++;
            console.log(`    ✅ Deleted`);
          } catch (error) {
            errors++;
            console.log(`    ❌ Error: ${error.message}`);
          }
        }
      }

      if (dryRun) {
        console.log('\n🔍 Dry run completed - no files were deleted');
        console.log(`Run without --dry-run to delete ${orphanedFiles.length} files`);
        return { deleted: 0, errors: 0, orphaned: orphanedFiles.length };
      } else {
        console.log(`\n✅ Cleanup completed: ${deleted} deleted, ${errors} errors`);
        return { deleted, errors };
      }

    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  async cleanupByServerDeletion(serverIds) {
    if (!Array.isArray(serverIds) || serverIds.length === 0) {
      console.log('❌ No server IDs provided');
      return { deleted: 0 };
    }

    try {
      const placeholders = serverIds.map(() => '?').join(',');
      const sql = `SELECT banner_url FROM servers WHERE id IN (${placeholders}) AND banner_url IS NOT NULL`;
      
      const rows = await new Promise((resolve, reject) => {
        this.db.all(sql, serverIds, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      let deleted = 0;
      for (const row of rows) {
        if (row.banner_url) {
          const filename = path.basename(row.banner_url);
          const filePath = path.join(this.uploadsDir, filename);
          
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deleted++;
              console.log(`✅ Deleted banner: ${filename}`);
            }
          } catch (error) {
            console.log(`❌ Could not delete banner ${filename}: ${error.message}`);
          }
        }
      }

      return { deleted };
    } catch (error) {
      console.error('❌ Error cleaning banners for servers:', error.message);
      throw error;
    }
  }

  async generateReport() {
    try {
      const referencedBanners = await this.getReferencedBanners();
      const uploadedFiles = await this.getUploadedFiles();
      
      let totalSize = 0;
      let referencedSize = 0;
      let orphanedSize = 0;
      
      const fileStats = new Map();
      
      for (const file of uploadedFiles) {
        const filePath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filePath);
        fileStats.set(file, stats.size);
        totalSize += stats.size;
        
        if (referencedBanners.has(file)) {
          referencedSize += stats.size;
        } else {
          orphanedSize += stats.size;
        }
      }

      const report = {
        totalFiles: uploadedFiles.size,
        referencedFiles: referencedBanners.size,
        orphanedFiles: uploadedFiles.size - referencedBanners.size,
        totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
        referencedSize: (referencedSize / 1024 / 1024).toFixed(2) + ' MB',
        orphanedSize: (orphanedSize / 1024 / 1024).toFixed(2) + ' MB'
      };

      console.log('\n📊 Banner Storage Report:');
      console.log('━'.repeat(40));
      console.log(`Total files: ${report.totalFiles}`);
      console.log(`Referenced files: ${report.referencedFiles}`);
      console.log(`Orphaned files: ${report.orphanedFiles}`);
      console.log(`Total size: ${report.totalSize}`);
      console.log(`Referenced size: ${report.referencedSize}`);
      console.log(`Orphaned size: ${report.orphanedSize}`);

      return report;
    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  const cleanup = new BannerCleanup();

  try {
    await cleanup.init();

    switch (command) {
      case 'clean':
        const dryRun = args.includes('--dry-run');
        await cleanup.cleanupOrphanedBanners(dryRun);
        break;

      case 'report':
        await cleanup.generateReport();
        break;

      case 'servers':
        const serverIds = args.slice(1).map(id => parseInt(id)).filter(id => !isNaN(id));
        await cleanup.cleanupByServerDeletion(serverIds);
        break;

      case 'help':
      default:
        console.log(`
🧹 Banner Cleanup Utility

Usage:
  node cleanup-banners.js <command> [options]

Commands:
  clean [--dry-run]    Clean up orphaned banner files
  report               Generate storage usage report  
  servers <id1> <id2>  Clean banners for specific server IDs
  help                 Show this help message

Examples:
  node cleanup-banners.js clean --dry-run    # Preview what would be deleted
  node cleanup-banners.js clean              # Actually delete orphaned files
  node cleanup-banners.js report             # Show storage statistics
  node cleanup-banners.js servers 1 2 3      # Clean banners for servers 1, 2, 3
        `);
        break;
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    cleanup.close();
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default BannerCleanup;