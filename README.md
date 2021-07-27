# msal-vote: simple online voting app

msal-vote is designed for transforming an offline one-man-one-vote election system to online mode. This app uses the msal library to allow you authenticating **any user** with a personal Microsoft Account or a work/school AD account. You can simply fork the repo and then **deploy the app for free** on Heroku, as it's using Node.js and PostgreSQL.

### Deployment using Heroku

1. Get a GitHub account and fork this repo. Edit `views/vote.ejs` to change the questions according to your own preference.

2. Get a Heroku account, create an app using the free plan and add a free Heroku PostgreSQL database. Mark down your app name for later use.

3. Register your voting app at https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade (You may need a personal Microsoft account to do this). Supported account types can be `Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)` and redirect URL would be `https://YOUR_APP_NAME.herokuapp.com/redirect`. In `Certificates & secrets` Create a new client secrets, mark down the Client secret Value and the Application (client) ID for later use. You may refer to `Step 1: Register your application` in https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-v2-nodejs-webapp-msal#register-and-download-your-quickstart-application for details.  

4. Go to Heroku Dashboard, in the Settings tab, add the following Config Vars for your app:

    1.`ADMIN`: a list of admins that can add voters' emails. Should be separated by comma with no space. Example: `email@example.com,contact@example.org,admin@example.net`

    2.`MSAL_REDIRECT_URI`: `https://YOUR_APP_NAME.herokuapp.com/redirect`

    3.`MSAL_CLIENTID`: the Application (client) ID mentioned above

    4.`MSAL_CLIENTSECRET`: the Client secret Value mentioned above

    5.`SESSION_SECRET`: a random alphabetical string like `5LmD5pyo5Z2C`

    6.`END_TIME`: the time when voting periods ends. should be a UNIX timestamp. You can convert time to UNIX timestamp with Google search results. Like for `Mon Jul 01 2047 00:00:00 GMT+0800 (Hong Kong Standard Time)` the UNIX timestamp is `2445523200`.

    7.`TIMEZONE`: optional and default to `Asia/Hong_Kong`. You can refer to TZ database name in https://en.wikipedia.org/wiki/List_of_tz_database_time_zones.

5. Go to Heroku Dashboard, in the Deploy tab, choose GitHub and link that repo. You may enable Automatic Deploys for auto deploy your repo if you need to change something later.

6. Your app is ready at `https://YOUR_APP_NAME.herokuapp.com/`. You can add valid voters' email at `https://YOUR_APP_NAME.herokuapp.com/add`.

### Q&A

1. How do you verify voter's identity?

    The identity is verified by Microsoft and passed back by M$ to the application. It's not provided by the voters themselves.

2. How can it be guaranteed that one can only vote once?

    The user table got locked when one is voting and no other voting can be performed at the same time. When one tried to vote for a second time, it will be spotted that s/he has already voted.

3. Why is your vote not verified backend?

    I don't have time to create a such a complicated system with a full CMS and dedicated backend verifying system. Plus, the malicious vote can be easily spotted. As long as one can only vote once, this would not be a problem.

4. How do you make sure voters can vote anonymously?

    Votes are not linked to voters in the database, thus no one will ever know who votes what.

### Local Development

An `.env.example` file is provided for your reference. To start the server run `npx nodemon`.

You can use the `docker-compose.yml` in the repo for setting up a local PostgreSQL database. To access the database, either run `docker exec -it msal-vote_PostgreSQL_1 psql -Upostgres` or `sudo apt install postgresql-client && psql -h localhost -U postgres`.