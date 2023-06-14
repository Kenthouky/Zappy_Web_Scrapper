const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const sanitizeFilename = require('sanitize-filename');

const app = express();

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,'index.html'));
});
app.get('/scrape-web', (req, res) => {
  res.sendFile(path.join(__dirname,'scrape.html'));
});

app.get('/scrape', async (req, res) => {
  const url = req.query.url;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const scrapedUrls = new Set(); // Track scraped URLs to avoid duplicates

    // Block ads using request interception
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (
        request.resourceType() === 'image' ||
        request.resourceType() === 'script' ||
        request.resourceType() === 'stylesheet'
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    async function scrapePage(currentUrl) {
      if (scrapedUrls.has(currentUrl)) {
        return; // Skip if URL has already been scraped
      }

      scrapedUrls.add(currentUrl);

      await page.goto(currentUrl, { waitUntil: 'networkidle2' });

      const resources = await page.evaluate(() => {
        const getAttribute = (element, attribute) => element.getAttribute(attribute) || '';

        const links = Array.from(document.querySelectorAll('a[href]')).map((link) => getAttribute(link, 'href'));
        const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) =>
          getAttribute(link, 'href')
        );
        const scripts = Array.from(document.querySelectorAll('script[src]')).map((script) =>
          getAttribute(script, 'src')
        );
        const images = Array.from(document.querySelectorAll('img[src]')).map((img) => getAttribute(img, 'src'));

        return [...links, ...stylesheets, ...scripts, ...images];
      });

      const zip = new JSZip();
      const folderPath = 'scraped_folder';

      for (const resource of resources) {
        try {
          const absoluteUrl = new URL(resource, currentUrl).href;
          const response = await page.goto(absoluteUrl, { timeout: 5000 }); // Set a timeout for each request

          if (response.ok()) {
            const contentType = response.headers()['content-type'];
            const fileExtension = path.extname(absoluteUrl);
            const fileName = sanitizeFilename(path.basename(absoluteUrl));

            const content = await response.buffer();
            const filePath = path.join(folderPath, new URL(absoluteUrl).pathname);

            if (contentType.startsWith('text/html')) {
              if (currentUrl === url) {
                // Save the main page as index.html
                zip.file(path.join(folderPath, 'index.html'), content);
              } else {
                zip.file(filePath + '.html', content);
              }
            } else if (contentType.startsWith('text/css')) {
              zip.file(filePath + '.css', content);
            } else if (contentType.startsWith('application/javascript')) {
              zip.file(filePath + '.js', content);
            } else if (contentType.startsWith('image/')) {
              const extension = fileExtension || '.' + contentType.split('/')[1];
              zip.file(filePath + extension, content);
            } else if (fileExtension === '.php') {
              zip.file(filePath, content);
            }
          }
        } catch (error) {
          console.error(`Failed to scrape resource: ${resource}`, error);
        }
      }

      const linkedPages = resources
        .filter(
          (url) =>
            url !== currentUrl &&
            (url.endsWith('.html') || url.endsWith('.php')) &&
            !scrapedUrls.has(url) &&
            !url.includes('partner.googleadservices.com')
        )
        .map((url) => new URL(url, currentUrl).href);

      for (const linkedPage of linkedPages) {
        await scrapePage(linkedPage);
      }

      if (currentUrl === url) {
        // Zip the scraped files
        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

        const zipName = 'scraped_folder.zip';
        fs.writeFileSync(zipName, zipContent);

        res.attachment(zipName);
        res.sendFile(path.join(__dirname, zipName));
      }
    }

    await scrapePage(url);

    await browser.close();
  } catch (error) {
    console.error('Error occurred while scraping:', error);
    res.send('Error occurred while scraping.');
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
