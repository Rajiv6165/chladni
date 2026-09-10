const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
        if (!response.ok()) {
            console.log('RESPONSE NOT OK:', response.url(), response.status());
        }
    });

    await page.goto('http://localhost:8080/test/index.html?v=9', { waitUntil: 'networkidle0' });
    
    console.log('Page loaded, clicking start...');
    await page.click('#start-btn');
    
    await new Promise(r => setTimeout(r, 500));
    console.log('Clicking a piano key...');
    await page.mouse.down({ x: 200, y: 200 }); // click roughly where a key might be
    await new Promise(r => setTimeout(r, 1000));
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 500));
    
    await browser.close();
})();
