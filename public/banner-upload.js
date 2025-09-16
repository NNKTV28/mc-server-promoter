// Banner Upload Drag & Drop Functionality
export class BannerUpload {
  constructor(options) {
    this.dropZoneId = options.dropZoneId;
    this.fileInputId = options.fileInputId;
    this.urlInputId = options.urlInputId;
    this.previewId = options.previewId;
    this.previewImageId = options.previewImageId;
    this.removeBtnId = options.removeBtnId;
    this.onUpload = options.onUpload || (() => {});
    this.onRemove = options.onRemove || (() => {});
    
    this.init();
  }
  
  init() {
    this.dropZone = document.getElementById(this.dropZoneId);
    this.fileInput = document.getElementById(this.fileInputId);
    this.urlInput = document.getElementById(this.urlInputId);
    this.preview = document.getElementById(this.previewId);
    this.previewImage = document.getElementById(this.previewImageId);
    this.removeBtn = document.getElementById(this.removeBtnId);
    
    if (!this.dropZone) {
      console.warn(`Drop zone element not found: ${this.dropZoneId}`);
      return;
    }
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Drop zone click to trigger file input
    this.dropZone.addEventListener('click', () => {
      this.fileInput.click();
    });
    
    // File input change
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });
    
    // Drag and drop events
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    
    this.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
    });
    
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(file => file.type.startsWith('image/'));
      
      if (imageFile) {
        this.handleFile(imageFile);
      } else {
        this.showError('Please drop an image file (JPEG, PNG, GIF, WebP)');
      }
    });
    
    // Remove button
    if (this.removeBtn) {
      this.removeBtn.addEventListener('click', () => {
        this.removeBanner();
      });
    }
    
    // URL input change
    if (this.urlInput) {
      this.urlInput.addEventListener('input', (e) => {
        if (e.target.value.trim() && this.isValidUrl(e.target.value)) {
          this.showUrlPreview(e.target.value);
        } else if (!e.target.value.trim()) {
          this.hidePreview();
        }
      });
    }
  }
  
  async handleFile(file) {
    // Validate file
    if (!this.validateFile(file)) {
      return;
    }
    
    // Show preview immediately
    this.showFilePreview(file);
    
    // Upload file
    try {
      this.showProgress('Uploading...');
      const result = await this.uploadFile(file);
      
      if (result.success) {
        this.urlInput.value = result.url;
        this.urlInput.classList.add('has-file');
        this.showProgress('Upload successful!', 'success');
        this.onUpload(result);
        
        // Hide progress after 2 seconds
        setTimeout(() => this.hideProgress(), 2000);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.showError(error.message);
      this.hidePreview();
    }
  }
  
  validateFile(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!allowedTypes.includes(file.type)) {
      this.showError('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
      return false;
    }
    
    if (file.size > maxSize) {
      this.showError('File too large. Maximum size is 5MB.');
      return false;
    }
    
    return true;
  }
  
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('banner', file);
    
    const response = await fetch('/api/upload/banner', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    return await response.json();
  }
  
  showFilePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewImage.src = e.target.result;
      this.preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
  
  showUrlPreview(url) {
    this.previewImage.src = url;
    this.preview.style.display = 'block';
  }
  
  hidePreview() {
    this.preview.style.display = 'none';
    this.previewImage.src = '';
  }
  
  removeBanner() {
    this.urlInput.value = '';
    this.urlInput.classList.remove('has-file');
    this.hidePreview();
    this.hideProgress();
    this.onRemove();
  }
  
  showProgress(message, type = '') {
    let progressEl = this.dropZone.parentNode.querySelector('.banner-upload-progress');
    
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.className = 'banner-upload-progress';
      this.dropZone.parentNode.appendChild(progressEl);
    }
    
    progressEl.textContent = message;
    progressEl.className = `banner-upload-progress ${type}`;
  }
  
  hideProgress() {
    const progressEl = this.dropZone.parentNode.querySelector('.banner-upload-progress');
    if (progressEl) {
      progressEl.remove();
    }
  }
  
  showError(message) {
    this.showProgress(`❌ ${message}`, 'error');
    setTimeout(() => this.hideProgress(), 5000);
  }
  
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
  
  // Method to set initial banner URL (for edit forms)
  setBannerUrl(url) {
    if (url && this.isValidUrl(url)) {
      this.urlInput.value = url;
      this.showUrlPreview(url);
    }
  }
}

// Initialize banner upload functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Main form banner upload
  if (document.getElementById('bannerDropZone')) {
    window.mainBannerUpload = new BannerUpload({
      dropZoneId: 'bannerDropZone',
      fileInputId: 'bannerFileInput',
      urlInputId: 'banner_url',
      previewId: 'bannerPreview',
      previewImageId: 'bannerPreviewImage',
      removeBtnId: 'removeBanner'
    });
  }
  
  // Edit form banner upload
  if (document.getElementById('editBannerDropZone')) {
    window.editBannerUpload = new BannerUpload({
      dropZoneId: 'editBannerDropZone',
      fileInputId: 'editBannerFileInput',
      urlInputId: 'editServerBanner',
      previewId: 'editBannerPreview',
      previewImageId: 'editBannerPreviewImage',
      removeBtnId: 'editRemoveBanner'
    });
  }
});