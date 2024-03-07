const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config')

const url = config['PULL_URL']

axios.get(url)
    .then(response => {
        const html = response.data;
        const $ = cheerio.load(html);
        const eventLinks = new Set();

		$('.Stack_root__1ksk7').each(function () {
		    const $element = $(this);
			const $typography = $element.find('.Typography_root__487rx');
	
		    // Check if the text contains 'Today'
		    if ($typography.text().includes('Today') || $typography.text().includes('Tomorrow')) {
		        const $link = $element.find('.event-card-link');
		        const href = $link.attr('href');
		 
		        if (href) {
		            eventLinks.add(href);
		        }
		    }
		});
		
        // Process each event link
        return Promise.all(Array.from(eventLinks).map(eventUrl => scrapeEvent(eventUrl)));
    })
    .then(events => {
        // Filter out null values if any scraping operations failed
        const validEvents = events.filter(event => event !== null);

		console.log("break1")
		console.log(validEvents)
        // Post the valid events to the batch insert endpoint
        if (validEvents.length > 0) {
			if(config['ENV'] === 'PROD'){
				console.log("break3")
            	postEventsToBatchInsert(validEvents);
			} else {
				console.log("break2")
            	console.log(validEvents);
			}
        }
    })
    .catch(console.error);

// Function to post the scraped events to the batch insert endpoint
function postEventsToBatchInsert(events) {
    axios.post(config['API_SERVER_URL'], events)
        .then(response => console.log('Batch insert successful:', response.data))
        .catch(error => console.error('Error in batch insert:', error));
}

function extractEndTime(str) {
    // First, try to find a time (number followed by am/pm) after "-"
    const timeRegex = /-(.*?)(\d{1,2}:\d{2}[ap]m|\d{1,2}[ap]m)/;
    let match = str.match(timeRegex);

    if (match && match[2]) {
        return match[2];
    } else {
        // If no time format found, find the last number after "-"
        const numberAfterDashRegex = /-(.*?)(\d{1,2})\b/;
        match = str.match(numberAfterDashRegex);
        if (match) {
            return match[2] + 'pm'; // Append 'pm' to the number
        }
    }

    return null;
}

function extractStartTime(str) {
    // First, try to find a time (number followed by am/pm) before "-"
    const timeRegex = /(\d{1,2}:\d{2}[ap]m|\d{1,2}[ap]m).*?-/;
    let match = str.match(timeRegex);

    if (match && match[1]) {
        return match[1];
    } else {
        // If no time format found, find the first number before "-"
        const numberBeforeDashRegex = /(\d{1,2})\s*-/;
        match = str.match(numberBeforeDashRegex);
        if (match) {
            return match[1] + 'pm'; // Append 'pm' to the number
        }
    }

    return null;
}

function separateLocation(location) {
    const addressRegex = /\d+\s[\w\s]+\s(?:Street|Avenue|Boulevard|Rd|Road|Highway|Way|Drive|Lane|Terrace|Court|Plaza|Parkway|Circle)\s[\w\s]+,\s[A-Z]{2}\s\d{5}/;
    const addressMatch = location.match(addressRegex);

    if (addressMatch) {
        const address = addressMatch[0];
        const locationName = location.replace(address, '').trim();
        return { locationName, address };
    } else {
        return { locationName: location, address: '' };
    }
}

function removeEmojisAndHTML(str) {
    // Regex to remove HTML tags
    const htmlTagRegex = /<\/?[^>]+(>|$)/g;
    // Regex to remove emojis
    const emojiRegex = /[\u{1F600}-\u{1F6FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/gu;

    return str.replace(htmlTagRegex, '').replace(emojiRegex, '');
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Add 1 because months start at 0
    const day = date.getDate().toString().padStart(2, '0');

    return `${year}${month}${day}`;
}

function convertToTimestamp(timeStr) {
    // Convert the time string to uppercase for case-insensitive AM/PM handling
    const upperTimeStr = timeStr.toUpperCase();

    // Extract hours, minutes and AM/PM part using a regular expression
    const timeParts = upperTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);

    if (!timeParts) {
        return "Invalid time format";
    }

    let hours = parseInt(timeParts[1], 10);
    const minutes = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
    const ampm = timeParts[3];

    // Adjust hours for PM
    if (ampm === 'PM' && hours < 12) {
        hours += 12;
    }
    // Adjust 12 AM to 0 hours
    if (ampm === 'AM' && hours === 12) {
        hours = 0;
    }

    // Formatting hours and minutes to get a timestamp
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}`;
}

function formatEventDates(date, startTime, endTime) {
  // Parse the date string in YYYYMMDD format into a JavaScript Date object
  const year = date.substr(0, 4);
  const month = date.substr(4, 2) - 1; // Months in JavaScript are 0-based
  const day = date.substr(6, 2);

  const eventStartDate = new Date(year, month, day);

  // Parse the startTime and endTime strings
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  // Create the eventStartTime and eventEndTime Date objects
  const eventStartTime = new Date(eventStartDate);
  eventStartTime.setHours(startHour, startMinute, 0, 0);

  const eventEndTime = new Date(eventStartDate);
  eventEndTime.setHours(endHour, endMinute, 0, 0);

  // Check if endTime is past midnight and adjust the date accordingly
  if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
    eventEndTime.setDate(eventEndTime.getDate() + 1); // Move to the next day
  }

  return {
    eventStartTime,
    eventEndTime,
  };
}

function scrapeEvent(eventUrl) {
    return axios.get(eventUrl)
        .then(response => {
            const html = response.data;
            const $ = cheerio.load(html);

            // Extracting the required information
            const title = $('.event-title').text().trim();
            const shortDescription = removeEmojisAndHTML($('.summary').text().trim());
            const description = removeEmojisAndHTML($('.eds-text--left').text().trim());
            const startTime = convertToTimestamp(extractStartTime($('.date-info__full-datetime').text().trim()));
            const endTime = convertToTimestamp(extractEndTime($('.date-info__full-datetime').text().trim()));
            const location = $('.location-info__address').text().trim().replace("Show map","");

			const { locationName, address } = separateLocation(location);
			const userId = "system"
			const date = formatDate(new Date());
			

			const regex = /\S+\s+(.+?),\s([A-Z]{2})\s(\d{5})/
			const match = address.match(regex);
		
			let street
			let state
			let zip

			if (match) {
			    street = match[1].trim();
    			state = match[2];
    			zip = match[3];

			} else {
			    console.log("Address format not recognized");
			}				

			//do date math
			const { eventStartTime, eventEndTime } = formatEventDates(date, startTime, endTime);

            return {
                title,
				shortDescription,
				description,
                startTime,
				endTime,
				eventStartTime,
				eventEndTime,
				date,
                locationName,
				address,
				street,
				state,
				zip,
				userId
            };
        })
        .catch(error => {
            console.error(`Error scraping ${eventUrl}: ${error}`);
            return null;
        });
}

