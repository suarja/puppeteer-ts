import puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';

async function scrapeWebsite(): Promise<void> {
   let browser: Browser | undefined;

   try {
      console.log('Starting browser...');

      // Launch browser
      browser = await puppeteer.launch({
         headless: true,
         args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
         ]
      });

      // Create new page
      const page = await browser.newPage();

      // Set viewport size
      await page.setViewport({ width: 1280, height: 720 });

      // Navigate to website
      console.log('Navigating to website...');
      await page.goto('https://railway.app', {
         waitUntil: 'networkidle2'
      });

      // Get page title
      const title = await page.title();
      console.log('Page title:', title);

      // Try to get text content from h1 if exists
      try {
         const heading = await page.$eval('h1', el => (el as HTMLElement).textContent);
         console.log('Main heading:', heading);
      } catch (headingError) {
         console.log('Could not find h1 element');
      }

      console.log('Scraping completed successfully!');

   } catch (error) {
      console.error('Error occurred:', error);
   } finally {
      // Always close the browser
      if (browser) {
         await browser.close();
         console.log('Browser closed');
      }
   }
}

// Run the scraping function
scrapeWebsite().catch(console.error);

