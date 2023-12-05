// cd src
// ngrok http 3000
// nodemon index.js
// then put in the new http to Request URL

// https://slack.com/oauth/v2/authorize?scope=channels:history,channels:read,chat:write,commands,im:history,users.profile:read,users:read,users:read.email,im:history,users.profile:read,users:read,users:read.email&client_id=5933502489445.5959444542064 

// <a href="https://slack.com/oauth/v2/authorize?client_id=5933502489445.5959444542064&scope=channels:history,channels:read,chat:write,commands,im:history,users.profile:read,users:read,users:read.email&user_scope=im:history,users.profile:read,users:read,users:read.email"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>

const { App } = require('@slack/bolt')
require('dotenv').config()

// Initializes app 
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

(async () => {
  // Starts app
  await app.start(process.env.PORT || 3000)
  console.log('⚡️Bolt app is running!')
})()

function getCurrentTimeInTimezone(timezone) {
  const now = new Date();
  const options = {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZone: timezone,
  };

  return now.toLocaleString('en-US', options);
}


app.command('/timezone', async ({ ack, body, client }) => {
  await ack();
  try {
    const chan = body.channel_id;
    const channame = body.channel_name;
    const result = await client.conversations.members({ channel: chan });
    const memberIds = result.members;

    // Fetch user information for each ID
    const userPromises = memberIds.map(async memberId => {
      const userInfo = await client.users.info({ user: memberId });

      // skip data portal bot
      if (userInfo.user.real_name === 'Data Portal') {
        return null; // Skip this user
      }

      return userInfo.user;
    });

    // Filter out null values to get an array of non-skipped users
    const users = (await Promise.all(userPromises)).filter(user => user !== null);

// Create image and section blocks for each member
const membersByTimezone = {};
users.forEach(user => {
  const timezoneOffset = user.tz_offset || 0;
  const ianaTimezone = user.tz || 'Unknown';

  if (!membersByTimezone[ianaTimezone]) {
    membersByTimezone[ianaTimezone] = [];
  }
  membersByTimezone[ianaTimezone].push(user.profile.real_name_normalized);
});

// Calculate the percentage of members for each timezone
const totalMembers = users.length;
const timezoneBlocks = await Promise.all(
  Object.entries(membersByTimezone).map(async ([ianaTimezone, members]) => {
    const percent = ((members.length / totalMembers) * 100).toFixed(2);

    // Display timezone in correct format
    const timezoneName = ianaTimezone === 'Unknown' ? 'Unknown' : getTimezoneName(ianaTimezone);

    // Generate blocks for Slack message
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${percent}% are in ${timezoneName}*\nTime: ${await getCurrentTimeInTimezone(ianaTimezone)}\n${members.join(', ')} (${members.length})`,
        },
      },
    ];
    return blocks;
  })
);

// timezone name without the current time
function getTimezoneName(ianaTimezone) {
  const now = new Date();
  const options = {
    timeZone: ianaTimezone,
    timeZoneName: 'long',
  };

  return new Intl.DateTimeFormat('en-US', options).formatToParts(now).find(part => part.type === 'timeZoneName').value;
}

async function getCurrentTimeInTimezone(timezone) {
  const now = new Date();
  const options = {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
  };

  return now.toLocaleString('en-US', options);
}

const modalResult = await client.views.open({
  trigger_id: body.trigger_id,
  view: {
    type: 'modal',
    callback_id: 'view_1',
    title: {
      type: 'plain_text',
      text: `Timezones of ${channame}`, 
    },
    blocks: timezoneBlocks.flat(), 
  },
});
  } catch (error) {
    console.error(error);
  }
});



app.command('/timeline', async ({ ack, body, client }) => {
  await ack();
  try {
    const chan = body.channel_id;
    const channame = body.channel_name;
    const result = await client.conversations.members({ channel: chan });
    const memberIds = result.members;

    // Fetch user information for each member ID
    const userPromises = memberIds.map(async memberId => {
      const userInfo = await client.users.info({ user: memberId });

      if (userInfo.user.real_name === 'Data Portal') {
        return null; // Skip this user
      }

      return userInfo.user;
    });

    const users = (await Promise.all(userPromises)).filter(user => user !== null);

    const currentYear = new Date().getFullYear();
    const monthlyCounts = {};

    users.forEach(user => {
      const joinDate = new Date(user.updated * 1000); // Convert to milliseconds

      if (joinDate.getFullYear() === currentYear) {
        const monthYear = `${joinDate.getMonth() + 1}/${joinDate.getFullYear()}`;

        // Initialize a Set for each unique month to store unique user IDs
        if (!monthlyCounts[monthYear]) {
          monthlyCounts[monthYear] = new Set();
        }

        // Add user ID to the Set for each user in the month
        monthlyCounts[monthYear].add(user.id);

        // If there's a previous month, add users from the previous month to the current month
        const previousMonth = getPreviousMonth(monthYear);
        if (previousMonth && monthlyCounts[previousMonth]) {
          monthlyCounts[monthYear] = new Set([...monthlyCounts[monthYear], ...monthlyCounts[previousMonth]]);
        }
      }
    });

    // Convert the monthlyCounts object to an array of blocks for Slack message
    const timelineBlocks = [];

    const years = Array.from(new Set(Object.keys(monthlyCounts).map(monthYear => monthYear.split('/')[1])));
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    years.forEach(year => {
      timelineBlocks.push({
        type: 'divider',
      });
      timelineBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${year}*`,
        },
      });

      const yearMonths = Object.entries(monthlyCounts)
        .filter(([monthYear]) => monthYear.endsWith(`/${year}`));

      // Sort the months chronologically
      yearMonths.sort((a, b) => a[0].localeCompare(b[0])).forEach(([monthYear, usersSet]) => {
        const [month] = monthYear.split('/');
        const monthName = monthNames[parseInt(month) - 1];

        // Add the section for the current month
        timelineBlocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${monthName}:* ${usersSet.size} members`,
          },
        });
      });
    });

    // Open the modal with the dynamically generated blocks
    const modalResult = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'view_1',
        title: {
          type: 'plain_text',
          text: `Timeline of ${channame}`,
        },
        blocks: timelineBlocks,
      },
    });
  } catch (error) {
    console.error(error);
  }
});

// Function to get the previous month
function getPreviousMonth(monthYear) {
  const [month, year] = monthYear.split('/');
  const previousMonth = month === '1' ? 12 : parseInt(month) - 1;
  const previousYear = month === '1' ? parseInt(year) - 1 : parseInt(year);
  return `${previousMonth}/${previousYear}`;
}

app.command('/emails', async ({ ack, body, client }) => {
  await ack();
  try {
    const chan = body.channel_id;
    const channame = body.channel_name;
    const result = await client.conversations.members({ channel: chan });
    const memberIds = result.members;

    // Fetch user information for each member ID
    const userPromises = memberIds.map(async memberId => {
      const userInfo = await client.users.info({ user: memberId });
      return userInfo.user;
    });

    const userEmails = (await Promise.all(userPromises))
      .map(user => user.profile.email)
      .filter(email => email);

    // Create a string with the emails
    const emailString = userEmails.join('; ');

    // Check if there are any emails before proceeding
    if (!emailString) {
      console.log('No emails found.');
      return;
    }

    // Create blocks for the modal
    const MemberBlocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": emailString
        },
      }
    ];

    // Open the modal with the dynamically generated blocks
    const modalResult = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'view_1',
        title: {
          type: 'plain_text',
          text: `Emails of ${channame}`,
        },
        blocks: MemberBlocks,
      },
    });

  } catch (error) {
    console.error(error);
  }
});


app.command('/members', async ({ ack, body, client }) => {
  await ack();
  try {
    const chan = body.channel_id;
    const channame = body.channel_name;
    const result = await client.conversations.members({ channel: chan });
    const memberIds = result.members;

    // Fetch user information for each member ID
    const userPromises = memberIds.map(async memberId => {
    const userInfo = await client.users.info({ user: memberId });

      if (userInfo.user.real_name === 'Data Portal') {
        return null; // Skip this user
      }

      return userInfo.user;
    });

    const users = (await Promise.all(userPromises)).filter(user => user !== null);
    console.log(users);
    // Create image and section blocks for each member
    const memberBlocks = users.map(user => [
      {
        type: 'section',
        accessory: {
          type: 'image',
          image_url: user.profile.image_48 || 'https://placekitten.com/48/48', //place holder image
          alt_text: `Profile Picture for ${user.real_name}`,
        },
        fields: [
          {
            type: 'mrkdwn',
            text: `*${user.profile.real_name_normalized}*\n${user.profile.title || " - "}\n${user.profile.email}\n_${user.tz_label}_`,
          },
        ],
      },
      {
        type: 'divider',
      },
    ]);

    const flattenedMemberBlocks = memberBlocks.flat();

    // member count block
    flattenedMemberBlocks.unshift({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Total Members: ${users.length}*`,
      },
    },
    {"type": "divider"});

    const modalResult = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'view_1',
        title: {
          type: 'plain_text',
          text: 'Members of ' + channame,
        },
        blocks: flattenedMemberBlocks,
      },
    });
  } catch (error) {
    console.error(error);
  }
});


app.message('.channels', async ({ message, say, client }) => {
let conversationsStore = {};

async function populateConversationStore() {
  try {
    const result = await client.conversations.list();
    saveConversations(result.channels);
  }
  catch (error) {
    console.error(error);
  }
}
// save conversation
function saveConversations(conversationsArray) {
  let conversationId = '';
  var names = [];
  conversationsArray.forEach(function(conversation){
    conversationId = conversation["id"];
    conversationsStore[conversationId] = conversation;
    names.unshift(conversation.name); //adds the name to the array
  });
  var resultString = names.join(", ");
  say(`Channels: ${resultString} `)
}
populateConversationStore();
});
