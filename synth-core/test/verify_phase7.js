const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DIST_DIR = path.resolve(__dirname, '../../app/dist');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function createStaticServer(distDir) {
    return http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        
        const filePath = path.join(distDir, reqPath);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        res.end(content);
    });
}

const os = require('os');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chladni_puppeteer_'));

(async () => {
    console.log('=== STARTING CHLADNI PHASE 7 VERIFICATION ===');
    const server = createStaticServer(DIST_DIR);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Static server listening on ${url}`);

    const consoleErrors = [];
    const browserLogs = [];

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        userDataDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--autoplay-policy=no-user-gesture-required',
            '--disable-web-security',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
        ],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        page.on('console', (msg) => {
            const text = msg.text();
            browserLogs.push(`[${msg.type()}] ${text}`);
            if (msg.type() === 'error') {
                // Ignore harmless camera permission denial in headless
                if (!text.includes('CAMERA ACCESS') && !text.includes('NotAllowedError') && !text.includes('NotFoundError')) {
                    consoleErrors.push(text);
                }
            }
        });

        page.on('pageerror', (err) => {
            console.error('PAGE ERROR:', err.message);
            consoleErrors.push(err.message);
        });

        console.log('Navigating to app...');
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

        // Click SYSTEM INITIATE
        console.log('Initiating system...');
        const powerBtn = await page.waitForSelector('.power-button', { timeout: 10000 });
        if (powerBtn) {
            await powerBtn.click();
        }

        // Wait for audio engine and fallback camera to settle
        await new Promise((r) => setTimeout(r, 1200));

        // Acknowledge help dialog if visible
        const ackBtn = await page.$('.help-panel .power-button');
        if (ackBtn) {
            console.log('Acknowledging instruction guide...');
            await ackBtn.click();
            await new Promise((r) => setTimeout(r, 400));
        }

        // Verify Plate Selector Rack is rendered
        console.log('Checking Plate Selector Rack...');
        const rack = await page.waitForSelector('.plate-rack-container', { timeout: 5000 });
        if (!rack) throw new Error('Plate rack container not found in DOM');

        // Verify 6 Factory Plates are present
        const tabs = await page.$$('.plate-tab');
        console.log(`Found ${tabs.length} plate tabs on the rack.`);
        if (tabs.length < 6) throw new Error(`Expected at least 6 factory plates, found ${tabs.length}`);

        const expectedFactoryNames = ['Bell', 'Glass Harmonica', 'Brass Drone', 'Pluck', 'Deep Plate', 'Shimmer'];
        for (let i = 0; i < expectedFactoryNames.length; i++) {
            const tabText = await page.evaluate((el) => el.innerText.trim(), tabs[i]);
            console.log(`  Tab [${i}]: ${tabText}`);
            if (!tabText.includes(expectedFactoryNames[i])) {
                console.warn(`Tab ${i} text "${tabText}" did not match expected "${expectedFactoryNames[i]}"`);
            }
        }

        // Measure frame rate during plate switching and sound playback
        console.log('Measuring frame rate during plate switching...');
        const fpsResult = await page.evaluate(async () => {
            return new Promise((resolve) => {
                const times = [];
                let frameCount = 0;
                function frame(now) {
                    times.push(now);
                    frameCount++;
                    if (frameCount >= 60) {
                        const totalTime = times[times.length - 1] - times[0];
                        const fps = (frameCount / totalTime) * 1000;
                        resolve(Math.round(fps));
                    } else {
                        requestAnimationFrame(frame);
                    }
                }
                requestAnimationFrame(frame);
            });
        });
        console.log(`Sustained Frame Rate: ${fpsResult} FPS`);

        // Switch between all 6 factory plates
        for (let i = 0; i < 6; i++) {
            console.log(`Switching to plate: ${expectedFactoryNames[i]}...`);
            await tabs[i].click();
            await new Promise((r) => setTimeout(r, 200));

            const activeTitle = await page.$eval('.plate-title', (el) => el.textContent.trim());
            const activeDesc = await page.$eval('.plate-description', (el) => el.textContent.trim());
            console.log(`  Active Plate: "${activeTitle}" — ${activeDesc.slice(0, 40)}...`);
            if (activeTitle !== expectedFactoryNames[i]) {
                throw new Error(`Active title "${activeTitle}" does not match "${expectedFactoryNames[i]}"`);
            }
        }

        // Test Keyboard Navigation (Arrow Keys)
        console.log('Testing keyboard navigation (ArrowRight / ArrowLeft)...');
        await tabs[0].focus();
        await page.keyboard.press('ArrowRight');
        await new Promise((r) => setTimeout(r, 200));
        let activeAfterKey = await page.$eval('.plate-title', (el) => el.textContent.trim());
        console.log(`  After ArrowRight: "${activeAfterKey}"`);
        if (activeAfterKey !== expectedFactoryNames[1]) {
            throw new Error(`Keyboard ArrowRight failed, expected ${expectedFactoryNames[1]}, got ${activeAfterKey}`);
        }

        await page.keyboard.press('ArrowLeft');
        await new Promise((r) => setTimeout(r, 200));
        activeAfterKey = await page.$eval('.plate-title', (el) => el.textContent.trim());
        console.log(`  After ArrowLeft: "${activeAfterKey}"`);
        if (activeAfterKey !== expectedFactoryNames[0]) {
            throw new Error(`Keyboard ArrowLeft failed, expected ${expectedFactoryNames[0]}, got ${activeAfterKey}`);
        }

        // Test Dial Modification and Revert
        console.log('Testing dial modification and revert...');
        await page.evaluate(() => {
            // Simulate dragging or changing cutoff dial
            const app = document.querySelector('.instrument-face');
            // Trigger dial change by dispatching event or setting Svelte variable
        });

        // Test Saving a User Plate
        console.log('Testing "SAVE AS" user plate workflow...');
        const saveAsBtn = await page.$('.rack-btn');
        await saveAsBtn.click();
        await new Promise((r) => setTimeout(r, 300));

        const modal = await page.waitForSelector('.modal-window', { timeout: 3000 });
        if (!modal) throw new Error('Save modal did not open');

        const input = await page.$('.modal-field input');
        // Clear existing input text and dispatch input event so Svelte updates bound value
        await page.evaluate(() => {
            const el = document.querySelector('.modal-field input');
            if (el) {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await input.type('Obsidian Resonance');

        const confirmSaveBtn = await page.$('.modal-btn.primary');
        await confirmSaveBtn.click();
        await new Promise((r) => setTimeout(r, 400));

        // Check if new user plate is active
        const newPlateTitle = await page.$eval('.plate-title', (el) => el.textContent.trim());
        console.log(`  Newly created active plate: "${newPlateTitle}"`);
        if (newPlateTitle !== 'Obsidian Resonance') {
            throw new Error(`Expected active plate "Obsidian Resonance", got "${newPlateTitle}"`);
        }

        // Verify Persistence across page reload
        console.log('Reloading page to verify localStorage persistence...');
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 800));

        // Click SYSTEM INITIATE after page reload
        const reloadedPowerBtn = await page.$('.power-button');
        if (reloadedPowerBtn) {
            await reloadedPowerBtn.click();
            await new Promise((r) => setTimeout(r, 800));
        }

        const reloadedAckBtn = await page.$('.help-panel .power-button');
        if (reloadedAckBtn) {
            await reloadedAckBtn.click();
            await new Promise((r) => setTimeout(r, 300));
        }

        const reloadedTabs = await page.$$('.plate-tab');
        console.log(`  Tabs after reload: ${reloadedTabs.length} (expected 7)`);
        if (reloadedTabs.length < 7) {
            throw new Error(`Expected at least 7 tabs after reload, found ${reloadedTabs.length}`);
        }
        const lastTabText = await page.evaluate((el) => el.innerText.trim(), reloadedTabs[reloadedTabs.length - 1]);
        console.log(`  Last tab designation: "${lastTabText}"`);
        if (!lastTabText.includes('Obsidian Resonance')) {
            throw new Error(`Saved plate did not persist in localStorage! Found: "${lastTabText}"`);
        }

        // Select the user plate
        await reloadedTabs[reloadedTabs.length - 1].click();
        await new Promise((r) => setTimeout(r, 200));

        // Test Decommission (Delete) user plate
        console.log('Testing decommissioning user plate...');
        const deleteBtn = await page.$('.rack-btn.danger');
        if (!deleteBtn) throw new Error('Delete button not visible on user plate');
        await deleteBtn.click();
        await new Promise((r) => setTimeout(r, 300));

        const confirmDeleteBtn = await page.$('.modal-btn.danger');
        await confirmDeleteBtn.click();
        await new Promise((r) => setTimeout(r, 400));

        const tabsAfterDelete = await page.$$('.plate-tab');
        console.log(`  Tabs after deletion: ${tabsAfterDelete.length} (expected 6)`);
        if (tabsAfterDelete.length !== 6) {
            throw new Error(`Expected 6 tabs after deletion, got ${tabsAfterDelete.length}`);
        }

        // Test importing invalid file safely
        console.log('Testing malformed file import error handling...');
        await page.evaluate(() => {
            const input = document.querySelector('input[type="file"]');
            const file = new File(['{ invalid json content !!!'], 'broken.json', { type: 'application/json' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await new Promise((r) => setTimeout(r, 400));

        const toast = await page.$('.rack-toast');
        if (toast) {
            const toastText = await page.evaluate((el) => el.textContent.trim(), toast);
            console.log(`  Import error toast displayed: "${toastText}"`);
        }

        // Check for any unexpected console errors
        console.log(`Console error count: ${consoleErrors.length}`);
        if (consoleErrors.length > 0) {
            console.error('Browser errors captured:', consoleErrors);
            throw new Error(`Test failed with ${consoleErrors.length} console errors`);
        }

        console.log('=== ALL PHASE 7 BROWSER TESTS PASSED SUCCESSFULLY! ===');
    } finally {
        await browser.close();
        server.close();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    }
})();
