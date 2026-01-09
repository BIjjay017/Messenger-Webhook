// Import dependencies
const express = require("express");

const app = express();

// Configuration from environment variables
const config = {
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN,
  verifyToken: process.env.VERIFY_TOKEN,
};

// Parse JSON request bodies
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Create the endpoint for your webhook
app.post("/webhook", (req, res) => {
  let body = req.body;

  console.log(`🟪 Received webhook:`);
  console.dir(body, { depth: null });

  // Send a 200 OK response if this is a page webhook
  if (body.object === "page") {
    // Returns a '200 OK' response to all requests
    res.status(200).send("EVENT_RECEIVED");

    // Process each entry - there may be multiple if batched
    body.entry.forEach((entry) => {
      // Get the webhook event
      let webhookEvent = entry.messaging[0];
      console.log(webhookEvent);

      // Get the sender PSID
      let senderPsid = webhookEvent.sender.id;
      console.log("Sender PSID: " + senderPsid);

      // Handle the message or postback
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message);
      } else if (webhookEvent.postback) {
        handlePostback(senderPsid, webhookEvent.postback);
      }
    });
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// Verification endpoint for Facebook webhook
app.get("/webhook", (req, res) => {
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === config.verifyToken) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages
function handleMessage(senderPsid, receivedMessage) {
  let response;

  if (receivedMessage.text) {
    // Echo the text message back
    response = {
      text: `You sent: "${receivedMessage.text}"`,
    };
  } else if (receivedMessage.attachments) {
    // Handle attachments
    response = {
      text: "Sorry, I can't process attachments yet.",
    };
  }

  // Send the response message
  callSendAPI(senderPsid, response);
}

// Handle postback events
function handlePostback(senderPsid, receivedPostback) {
  let response;
  let payload = receivedPostback.payload;

  if (payload === "GET_STARTED") {
    response = { text: "Welcome! How can I help you today?" };
  } else {
    response = { text: `You triggered postback: ${payload}` };
  }

  callSendAPI(senderPsid, response);
}

// Send message via Facebook Send API
function callSendAPI(senderPsid, response) {
  // Validate PSID before sending
  if (!senderPsid || senderPsid === "" || senderPsid === "undefined") {
    console.error("Invalid PSID: Cannot send message without a valid recipient ID");
    return;
  }

  // Validate response object
  if (!response || (!response.text && !response.attachment)) {
    console.error("Invalid response: Message must have text or attachment");
    return;
  }

  const requestBody = {
    recipient: {
      id: senderPsid,
    },
    message: response,
  };

  console.log("Sending message to PSID:", senderPsid);
  console.log("Message payload:", JSON.stringify(requestBody, null, 2));

  // Use dynamic import for node-fetch (ES module)
  import("node-fetch").then(({ default: fetch }) => {
    fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${config.pageAccessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          // Handle specific Facebook API errors
          const errorCode = json.error.code;
          const errorMessage = json.error.message;

          switch (errorCode) {
            case 551:
              console.error(`Error #551: This person isn't available right now.`);
              console.error("Possible reasons: User blocked the page, deleted account, or hasn't opted in.");
              break;
            case 100:
              console.error(`Error #100: Invalid parameter.`);
              console.error("Check if PSID is correct and user has messaged the page first.");
              break;
            case 10:
              console.error(`Error #10: Permission denied.`);
              console.error("Check if PAGE_ACCESS_TOKEN has 'pages_messaging' permission.");
              break;
            case 190:
              console.error(`Error #190: Invalid access token.`);
              console.error("PAGE_ACCESS_TOKEN may be expired or invalid.");
              break;
            default:
              console.error(`Facebook API Error #${errorCode}: ${errorMessage}`);
          }
          console.error("Full error:", JSON.stringify(json.error, null, 2));
        } else {
          console.log("Message sent successfully:", json);
        }
      })
      .catch((err) => {
        console.error("Network error sending message:", err.message);
      });
  });
}

// Root endpoint
app.get("/", (req, res) => {
  res.send("Facebook Messenger Webhook is running!");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});