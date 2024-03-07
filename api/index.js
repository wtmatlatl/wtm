const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { startOfDay, formatISO } = require('date-fns');
const moment = require('moment-timezone');
const config = require('./config')

const app = express();
app.use(bodyParser.json());

// MongoDB Connection
const connectionString = config['DBURL']

mongoose.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB...', err));

// Define a Schema
const eventSchema = new mongoose.Schema({
    title: String,
    shortDescription: String,
    description: String,
	date: String,
    startTime: String,
    endTime: String,
	eventStartTime: Date,
	eventEndTime: Date,
    locationName: String,
    address: String,
    street: String,
    state: String,
    zip: String,
    userId: String,
    createdAt: { type: Date, default: Date.now }
});

// Create a Model targeting 'eventPreprocess' collection
const Event = mongoose.model('Event', eventSchema, 'eventPreprocess');

async function isDuplicate(address) {
    const today = startOfDay(new Date());
    const count = await Event.countDocuments({ 
        address: address, 
        createdAt: { $gte: today }
    });
    return count > 0;
}

//format dates to be human readable
function formatAMPM(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
}

//WTM
app.get('/', async (req, res) => {
    try {
        // Get the current time in EST
        const nowInEST = moment().tz("America/New_York");

        // Since the events in the database are stored in UTC,
        // and 'nowInEST' is in EST, we need to convert 'nowInEST' to a Date object
        // for comparison in the MongoDB query
        const nowForQuery = nowInEST.toDate();

        const events = await Event.find({
            eventStartTime: { $lte: nowForQuery },
            eventEndTime: { $gte: nowForQuery }
        }).select('_id title shortDescription description date eventStartTime eventEndTime startTime endTime locationName address street state zip userId createdAt')
		.sort({ eventStartTime: -1 });;

        // Construct the HTML response
        let html = '<html><body>';
        events.forEach(event => {

            html += `<h2>${event.title}</h2>`;
            html += `<p><b>ID:</b> ${event._id}</p>`;
            html += `<p><b>Short Description:</b> ${event.shortDescription}</p>`;
            html += `<p><b>Description:</b> ${event.description}</p>`;
            html += `<p><b>Date:</b> ${formatAMPM(event.date)}</p>`;
            html += `<p><b>Event Start Time:</b> ${formatAMPM(event.eventStartTime)}</p>`;
            html += `<p><b>Event End Time:</b> ${formatAMPM(event.eventEndTime)}</p>`;
            html += `<p><b>Location Name:</b> ${event.locationName}</p>`;
            html += `<p><b>Address:</b> ${event.address}, ${event.street}, ${event.state}, ${event.zip}</p>`;
            html += `<p><b>User ID:</b> ${event.userId}</p>`;
            html += `<p><b>Created At:</b> ${event.createdAt}</p>`;
            html += '<hr>'; // Solid line divider
        });
        html += '</body></html>';

        res.send(html);
    } catch (error) {
        res.status(500).send(`<html><body><p>Error: ${error.message}</p></body></html>`);
    }
});

function formatAMPM(date) {
    // This function should convert the UTC date to EST and format it to AM/PM
    const dateInEST = moment(date).tz("America/New_York");
    return dateInEST.format('YYYY-MM-DD hh:mm A'); // Adjust the format as needed
}

// Create
app.post('/api/events', async (req, res) => {
    const timestamp = formatISO(new Date());
    const userId = req.body.userId;

    if (await isDuplicate(req.body.address)) {
        console.log(`${timestamp} - UserID: ${userId} - Error: Duplicate event exists`);
        return res.status(400).json({ error: 'Duplicate event exists' });
    }

    const newEvent = new Event(req.body);
    newEvent.save()
        .then(event => {
            console.log(`${timestamp} - UserID: ${userId} - Record added`);
            res.json(event);
        })
        .catch(err => {
            console.log(`${timestamp} - UserID: ${userId} - Error: ${err.message}`);
            res.status(400).json({ error: 'Unable to add this event' });
        });
});

// Read All
app.get('/api/events', async (req, res) => {
    const events = await Event.find();
    res.send(events);
});

// Read One
app.get('/api/events/:id', async (req, res) => {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).send('The event with the given ID was not found.');
    res.send(event);
});

// Update
app.put('/api/events/:id', async (req, res) => {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!event) return res.status(404).send('The event with the given ID was not found.');
    res.send(event);
});

// Delete
app.delete('/api/events/:id', async (req, res) => {
    const event = await Event.findByIdAndRemove(req.params.id);
    if (!event) return res.status(404).send('The event with the given ID was not found.');
    res.send(event);
});

// Batch Update
app.put('/api/events/batch', async (req, res) => {
    try {
        const updatePromises = req.body.map(updateObj => {
            return Event.findByIdAndUpdate(updateObj._id, updateObj.update, { new: true });
        });

        const updatedEvents = await Promise.all(updatePromises);
        res.send(updatedEvents);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Batch Insert
app.post('/api/events/batch', async (req, res) => {
    const filteredEvents = [];
    const timestamp = formatISO(new Date());

    for (let event of req.body) {
        if (!(await isDuplicate(event.address))) {
            filteredEvents.push(event);
        } else {
            console.log(`${timestamp} - UserID: ${event.userId} - Error: Duplicate event exists`);
        }
    }

    Event.insertMany(filteredEvents)
        .then(events => {
            events.forEach(event => console.log(`${timestamp} - UserID: ${event.userId} - Record added`));
            res.json(events);
        })
        .catch(error => {
            console.log(`${timestamp} - Error in batch insert: ${error.message}`);
            res.status(500).send(error.message);
        });
});

// Server Listening
const port = process.env.PORT || 3000;
app.listen(port, () => {
	console.log(`Listening on port ${port}...`)
	console.log("Current Date and Time:", new Date().toString());
});

