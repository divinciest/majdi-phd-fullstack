const status = document.getElementById('status');
const frame = document.getElementById('frame');
const reloadBtn = document.getElementById('reload');

async function loadPreview() {
  try {
    status.textContent = 'Loading preview...';
    const result = await chrome.storage.local.get(['previewHtml']);
    const html = result.previewHtml || '';
    
    if (!html) {
      status.textContent = 'No HTML to preview';
      frame.srcdoc = '<html><body style="padding:20px;font-family:sans-serif">No HTML content available</body></html>';
      return;
    }
    
    // Render HTML in iframe using srcdoc
    frame.srcdoc = html;
    status.textContent = `Loaded ${html.length.toLocaleString()} bytes`;
    
    // Clear preview storage after loading
    chrome.storage.local.remove(['previewHtml']);
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    frame.srcdoc = `<html><body style="padding:20px;font-family:sans-serif">Error loading preview: ${e.message}</body></html>`;
  }
}

reloadBtn.addEventListener('click', loadPreview);

// Load on page load
loadPreview();
