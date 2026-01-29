# Redirect Detection Feature

## Overview

The GatherGrid Crawler extension now includes automatic redirect detection to handle pages that have minimal content and redirect to another URL. This prevents extraction from placeholder/redirect pages and ensures the final content is captured.

## How It Works

### Detection Logic

1. **After page loads** (status='complete'), the extension checks the body text length
2. **If text >= 3000 characters**: Proceeds immediately with extraction
3. **If text < 3000 characters**: Enters redirect monitoring mode for up to 30 seconds:
   - Monitors for URL changes via `tabs.onUpdated` and `webNavigation.onCompleted`
   - Polls content length every 1 second to detect dynamic content loading
   - Waits for redirect or content increase

### Exit Conditions

The monitoring phase ends when:
- **URL changes** (redirect detected) → Waits for new page to load, then proceeds
- **Content increases** to >= 3000 chars → Proceeds with extraction
- **Timeout** (30 seconds) → Proceeds anyway with whatever content exists
- **Tab closed** → Aborts
- **Navigation error** → Proceeds with error handling

## Configuration

### Default Settings

```javascript
{
  redirectDetectionEnabled: true,      // Enable/disable feature
  redirectMinTextLength: 3000,         // Threshold for minimal content (chars)
  redirectMaxWaitMs: 30000,           // Max wait time (ms)
}
```

### User Configuration (via Extension Popup)

1. Open extension popup
2. Navigate to redirect settings section
3. Configure:
   - **Detect Redirects**: Toggle on/off
   - **Min Text Length**: Minimum chars to consider page has content (500-10000)
   - **Max Redirect Wait**: Max time to wait for redirect (5000-60000 ms)
4. Click "Save"

## Features

### Redirect Detection Methods

1. **URL Change Detection**
   - Via `chrome.tabs.onUpdated` listener
   - Via `chrome.webNavigation.onCompleted` listener
   - Detects meta refresh, JavaScript redirects, server redirects

2. **Content Growth Detection**
   - Periodic polling (every 1 second)
   - Detects SPA content that loads dynamically without URL change
   - Uses `document.body.innerText.length`

3. **Error Handling**
   - Tab closure detection
   - Navigation errors
   - Script injection failures
   - Graceful fallback on errors

### Stabilization Period

When redirect is detected:
- Waits 2 seconds for new page to stabilize
- Waits for `status='complete'` event on new page
- Then proceeds with normal extraction flow

## Integration Points

### Server Jobs (handleJob)

**Flow:**
```
1. Open tab with URL
2. Wait for tab complete
3. ✨ CHECK FOR REDIRECT (NEW)
   - If minimal content, monitor for redirect
   - If redirect detected, wait for new page load
4. Check crawl condition (if configured)
5. Execute domain script (if configured)
6. Extract HTML
7. Submit to server
```

### Test Crawls (gg-test-crawl)

Same redirect detection logic applied to manual test crawls from popup.

## Logging & Diagnostics

### Activity Logs

All redirect events are logged with full details:

```javascript
// Initial check
"Checking for redirect page on tab X"
"Tab X body text length: 1234"

// Minimal content detected
"Tab X has minimal content (1234 chars < 3000), monitoring for redirect"

// Redirect detected
"Tab X REDIRECT detected after 2500ms"
"Redirected page loaded"

// Content increased
"Tab X content increased to 4567 chars after 3200ms (no URL change)"

// Timeout
"Tab X redirect wait timeout after 30000ms"
```

### History Records

Each crawl history entry now includes redirect metadata:

```javascript
{
  url: "https://example.com/source",
  redirectOccurred: true,
  redirectReason: "url_changed",
  finalUrl: "https://example.com/source-full",
  initialTextLength: 1234,
  finalTextLength: 5678,
  phases: {
    redirectCheckMs: 2500,
    // ... other phases
  }
}
```

### Visual Indicators in Popup

History items show redirect status:

**Redirect detected:**
```
🔄 Redirect detected: url_changed (2500ms) · Text: 1234 → 5678 chars
```

**No redirect (sufficient content):**
```
✓ No redirect (4567 chars)
```

## Performance Impact

### Time Overhead

| Scenario | Additional Time |
|----------|----------------|
| Normal page (>3000 chars) | **0ms** - Proceeds immediately |
| Meta/JS redirect | **2-5s** - Redirect + stabilization |
| Dynamic content loading | **1-10s** - Until content threshold reached |
| Stuck redirect page | **30s** - Timeout (worst case) |

### Resource Usage

- 1 interval timer (checks content every 1s while waiting)
- 3 event listeners per monitored tab
- 1 script injection per second (content length check)
- All cleaned up after monitoring completes

## Error Handling

### Graceful Degradation

If redirect detection fails:
- Logs error with full details
- Continues with normal extraction flow
- Does not abort the job

### Edge Cases Handled

1. **Tab closed during monitoring**: Cleanup listeners, abort gracefully
2. **Navigation errors**: Log error, proceed with extraction
3. **Script injection failure**: Falls back to 0 content length, triggers timeout
4. **Multiple rapid redirects**: Catches first redirect, waits for stabilization
5. **Infinite redirect loop**: Times out after max wait period

## Use Cases

### 1. Academic Paper Sites

Many paper repositories show a landing/redirect page before the actual PDF or source:

```
Initial load: "Redirecting to source..." (500 chars)
  ↓ (redirect detected in 2s)
Final page: Full source text (15000 chars) ✓
```

### 2. Paywalls

Sites that check authentication then redirect:

```
Initial: "Checking access..." (200 chars)
  ↓ (redirect detected in 1.5s)
Final: Paywall or source content ✓
```

### 3. JavaScript SPAs

Single-page apps that load content dynamically:

```
Initial: Basic shell (800 chars)
  ↓ (content increases detected in 3s)
Final: Fully loaded content (8000 chars) ✓
```

### 4. Meta Refresh

HTML meta refresh tags:

```html
<meta http-equiv="refresh" content="0;url=https://example.com/target">
```

Detected via URL change monitoring.

## Configuration Examples

### Aggressive Detection (Lower Threshold)

For sites with very sparse redirect pages:

```javascript
{
  redirectDetectionEnabled: true,
  redirectMinTextLength: 1000,    // Lower threshold
  redirectMaxWaitMs: 20000,       // Shorter timeout
}
```

### Conservative Detection (Higher Threshold)

For sites that may have legitimate short content:

```javascript
{
  redirectDetectionEnabled: true,
  redirectMinTextLength: 5000,    // Higher threshold
  redirectMaxWaitMs: 45000,       // Longer timeout
}
```

### Disabled

For sites where all pages have content immediately:

```javascript
{
  redirectDetectionEnabled: false,
}
```

## Testing

### Test URLs

**Normal page (should proceed immediately):**
```
https://example.com/article-with-full-content
https://example.com/source-with-full-content
```

**Meta refresh redirect:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="2;url=https://example.com/target">
</head>
<body>Redirecting...</body>
</html>
```

**JavaScript redirect:**
```html
<!DOCTYPE html>
<html>
<body>
  Loading...
  <script>
    setTimeout(() => {
      window.location.href = 'https://example.com/target';
    }, 1000);
  </script>
</body>
</html>
```

**Dynamic content loading (SPA):**
```html
<!DOCTYPE html>
<html>
<body id="content">Loading...</body>
<script>
  setTimeout(() => {
    document.getElementById('content').textContent = 
      'Very long source content...'.repeat(100);
  }, 2000);
</script>
</html>
```

### Manual Testing Steps

1. Enable redirect detection in popup settings
2. Set min text length to 2000 (for testing)
3. Set max wait to 15000 ms
4. Use "Test Crawl" feature with a redirect URL
5. Check history for redirect info
6. Verify final HTML contains target page content

## Troubleshooting

### Issue: Not Detecting Redirects

**Possible causes:**
- Min text length set too low (page already exceeds threshold)
- Redirect happens before page load completes
- Content script injection failing

**Solutions:**
- Increase `redirectMinTextLength`
- Check browser console for errors
- Verify extension has proper permissions

### Issue: Timeout on Every Page

**Possible causes:**
- Min text length set too high
- Site uses iframes (only main frame content counted)
- Dynamic content never loads

**Solutions:**
- Lower `redirectMinTextLength` to 2000-3000
- Check if site loads content in iframes
- Increase `redirectMaxWaitMs`

### Issue: Multiple Redirects Not Handled

**Expected behavior:**
- Only first redirect is caught
- After redirect, new page loads normally
- If new page also redirects, it will be caught again

**Solution:**
- This is by design to prevent infinite loops
- Max wait timeout provides safety net

## API Reference

### waitForRedirectOrContent(tabId, minTextLength, maxWaitMs)

**Parameters:**
- `tabId` (number): Chrome tab ID
- `minTextLength` (number): Minimum content length threshold (default: 3000)
- `maxWaitMs` (number): Maximum wait time in milliseconds (default: 30000)

**Returns:** Promise<RedirectResult>

```typescript
interface RedirectResult {
  redirectOccurred: boolean;
  finalUrl: string | null;
  waitedMs: number;
  reason: 'sufficient_content' | 'url_changed' | 'navigation_completed' | 
          'content_increased' | 'timeout' | 'tab_closed' | 'navigation_error' | 'error';
  initialTextLength?: number;
  finalTextLength?: number;
  error?: string;
}
```

## Files Modified

1. **manifest.json**
   - Added `webNavigation` permission

2. **service-worker.js**
   - Added `waitForRedirectOrContent()` function (~175 lines)
   - Updated `DEFAULTS` configuration
   - Integrated into `handleJob()` for server jobs
   - Integrated into test crawl handler

3. **popup/popup.html**
   - Added 3 UI controls for redirect settings

4. **popup/popup.js**
   - Added redirect settings to save/load handlers
   - Enhanced history rendering to show redirect info

**Total:** ~220 lines of new code across 4 files

## Future Enhancements

Potential improvements:

1. **Per-Domain Settings**: Different thresholds per domain
2. **Redirect Chain Tracking**: Track full chain of redirects
3. **Smart Threshold**: Auto-adjust based on historical data
4. **Iframe Support**: Check content in iframes too
5. **Manual Override**: "Wait for redirect" button in test crawl

---

**Version**: 1.0  
**Last Updated**: 2025-10-10  
**Author**: GatherGrid Team
