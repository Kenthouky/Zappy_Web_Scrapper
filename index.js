// Import necessary modules
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// Create Express app
const app = express();

// Set up a route for the homepage
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/scrape-web', (req, res) => {
  res.sendFile(__dirname + '/scrape.html');
});

app.use(express.static('public'));

// Set up a route for handling form submissions
app.get('/scrape', (req, res) => {
  const url = req.query.url;

  // Send a GET request to the specified URL
  axios.get(url)
    .then(response => {
      // Load the HTML content of the website
      const $ = cheerio.load(response.data);
      let text = '';

      // Extract all the text from the website
      $('body').each((index, element) => {
        text += $(element).text();
      });

      // Save the scraped text to a file
      fs.writeFile('scraped_text.txt', text, err => {
        if (err) {
          console.error(err);
          res.send('Error occurred while scraping.');
        } else {
          res.download('scraped_text.txt');
        }
      });
    })
    .catch(error => {
      console.error(error);
      res.send('Error occurred while scraping.');
    });
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
