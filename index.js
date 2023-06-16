const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const sanitizeFilename = require('sanitize-filename');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/scrape-web', (req, res) => {
  res.sendFile(path.join(__dirname, 'scrape.html'));
});

app.get('/scrape', async (req, res) => {
  const url = req.query.url;

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
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

    async function scrapePage(currentUrl, depth = 0) {
      if (scrapedUrls.has(currentUrl)) {
        return; // Skip if URL has already been scraped
      }

      scrapedUrls.add(currentUrl);

      try {
        const response = await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 50000 });

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
            const response = await page.goto(absoluteUrl, { timeout: 50000 }); // Set a timeout for each request

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
                // Save other HTML pages
                zip.file(filePath, content);
              }
            } else if (!fileExtension || fileExtension === '.html') {
              // Save unknown or extension-less files as binary
              zip.file(filePath + '.bin', content);
            } else {
              // Save other files with their original extensions
              zip.file(filePath, content);
            }
          } catch (error) {
            console.error(`An error occurred while scraping ${resource}: ${error}`);
          }
        }

        // Recursively scrape child URLs
        if (depth < 2) {
          const childUrls = resources.filter((resource) => new URL(resource, currentUrl).origin === url);

          for (const childUrl of childUrls) {
            await scrapePage(new URL(childUrl, currentUrl).href, depth + 1);
          }
        }

        if (currentUrl === url) {
          // Generate and download ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          const zipFileName = sanitizeFilename(new URL(currentUrl).hostname) + '.zip';

          res.set('Content-Type', 'application/zip');
          res.set('Content-Disposition', `attachment; filename="${zipFileName}"`);
          res.send(zipContent);
        }
      } catch (error) {
        console.error(`An error occurred during scraping. Error: ${error}`);
        res.status(500).send('An error occurred during scraping.');
      }
    }

    await scrapePage(url);

    await browser.close();
  } catch (error) {
    console.error(`An error occurred while launching Puppeteer: ${error}`);
    res.status(500).send('An error occurred while launching Puppeteer.');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
