const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sanitizeFilename = require('sanitize-filename');
const path = require('path');
const JSZip = require('jszip');

const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/scrape-web', (req, res) => {
  res.sendFile(path.join(__dirname, 'scrape.html'));
});

app.use(express.static('public'));

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  const userAgent = req.query.userAgent;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Accept-Encoding': 'gzip, deflate',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        DNT: '1',
        Connection: 'close',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      follow: 20, // Maximum number of redirects to follow
    });

    const data = await response.text();

    const $ = cheerio.load(data);

    const links = [];
    $('a').each((index, element) => {
      const href = $(element).attr('href');
      if (href && !href.startsWith('javascript:') && !href.includes('twitter.com')) {
        links.push(href);
      }
    });

    const zip = new JSZip();

    const downloadPromises = links.map(async (link) => {
      const absoluteUrl = new URL(link, url).href;
      const response = await fetch(absoluteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          DNT: '1',
          Connection: 'close',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        follow: 20, // Maximum number of redirects to follow
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const fileExtension = '.html';
        const fileName = sanitizeFilename(path.basename(absoluteUrl));
        const sanitizedFileName = `${fileName}${fileExtension}`;
        const folderPath = path.join('scraped_folder', path.dirname(link));

        const content = await response.text();
        zip.folder(folderPath).file(sanitizedFileName, content);
      } else {
        console.error(`Failed to download ${absoluteUrl}: Response is not in HTML format`);
      }
    });

    await Promise.all(downloadPromises);

    const content = await zip.generateAsync({ type: 'nodebuffer' });

    const zipName = 'scraped_folder.zip';
    fs.writeFileSync(zipName, content);

    res.attachment(zipName);
    res.sendFile(path.join(__dirname, zipName));
  } catch (error) {
    console.error('Error occurred while scraping:', error);
    res.send('Error occurred while scraping.');
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
