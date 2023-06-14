// Function to close the modal after a specified duration (in milliseconds)
function closeScrapingModal(duration) {
    setTimeout(function () {
        $('#scraping-modal').modal('hide');
    }, duration);
}

// Example usage: close the modal after 3 seconds (3000 milliseconds)
closeScrapingModal(3000); // Adjust the duration as needed based on your scraping process
<script>
  $(document).ready(function() {
    $('#scraping-form').submit(function(event) {
      event.preventDefault(); // Prevent form submission
      $('#scraping-modal').modal('show'); // Show the modal
      // Here you can add your logic to perform scraping or any other actions
    });
  });
</script>
