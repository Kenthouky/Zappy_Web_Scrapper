const express = require('express');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');
const sanitizeFilename = require('sanitize-filename');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

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
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const scrapedUrls = new Set(); // Track scraped URLs to avoid duplicates
    const zip = new JSZip();

    async function scrapePage(currentUrl, depth = 0) {
      if (scrapedUrls.has(currentUrl)) {
        return; // Skip if URL has already been scraped
      }

      scrapedUrls.add(currentUrl);

      try {
        const response = await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 500000 });

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

        for (const resource of resources) {
          try {
            const absoluteUrl = new URL(resource, currentUrl).href;
            const response = await page.goto(absoluteUrl, { timeout: 50000 }); // Set a timeout for each request

            const contentType = response.headers()['content-type'];
            const fileExtension = path.extname(absoluteUrl);
            const fileName = sanitizeFilename(path.basename(absoluteUrl));

            const content = await response.buffer();

            if (contentType.startsWith('text/html')) {
              if (currentUrl === url) {
                // Save the main page as index.html
                zip.file('index.html', content);
              } else {
                // Save other HTML pages
                zip.file(`${fileName}.html`, content);
              }
            } else if (!fileExtension || fileExtension === '.php') {
              // Convert PHP files to HTML
              zip.file(`${fileName}.html`, content);
            } else {
              // Save other resources as is
              zip.file(fileName, content);
            }

            console.log(`Scraped: ${absoluteUrl}`);
          } catch (error) {
            console.error(`Failed to scrape resource: ${resource}`, error);
          }
        }

        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

        res.setHeader('Content-disposition', 'attachment; filename=scraped_files.zip');
        res.setHeader('Content-type', 'application/zip');
        res.send(zipContent);

        console.log('Scraping completed.');

        // Close the browser
        browser.close();
      } catch (error) {
        console.error(`Error occurred while scraping: ${currentUrl}`, error);
        res.status(500).send(`Error occurred while scraping: ${currentUrl}`);
      }
    }

    scrapePage(url);
  } catch (error) {
    console.error('An error occurred during scraping.', error);
    res.status(500).send('An error occurred during scraping.');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
