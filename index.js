require('dotenv').config()
const express = require("express");
const msal = require('@azure/msal-node');
const session = require('express-session')
const MemoryStore = require('memorystore')(session)
const { Pool } = require('pg')

const pool = new Pool({
    host: 'localhost',
    user: 'database-user',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    connectionString: process.env.DATABASE_URL || `postgres://postgres:${process.env.POSTGRES_PASSWORD}@localhost`,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false    // when working on heroku set to true, when working locally set to false
})

const ADMIN_ARRAY = process.env.ADMIN.split(",");
const END_TIME_UNIX = process.env.END_TIME || 2445523200;
const END_TIME_MS = new Date(END_TIME_UNIX * 1000);
const TIMEZONE = process.env.TIMEZONE || "Asia/Hong_Kong";
const TABLENAME_USER = process.env.TABLENAME_USER || "users";
const TABLENAME_VOTE = process.env.TABLENAME_VOTE || "votes";

// user table for 
pool.query(`
CREATE TABLE IF NOT EXISTS ${TABLENAME_USER} (
    email   TEXT PRIMARY KEY,
    voted   BOOLEAN
);
`).then((res, err) => {
    //console.log(res)
    //console.log(err)
});

pool.query(`
CREATE TABLE IF NOT EXISTS ${TABLENAME_VOTE} (
    id      SERIAL PRIMARY KEY,
    votes   TEXT
);
`).then((res, err) => {
    //console.log(res)
    //console.log(err)
});

const SERVER_PORT = process.env.PORT || 3000;


const config = {
    auth: {
        clientId: process.env.MSAL_CLIENTID,
        authority: "https://login.microsoftonline.com/common",
        clientSecret: process.env.MSAL_CLIENTSECRET
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                //console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Verbose,
        }
    }
};

// Create msal application object
const pca = new msal.ConfidentialClientApplication(config);

// Create Express App and Routes
const app = express();

app.set('view engine', 'ejs');
app.use(session({
    secret: process.env.SESSION_SECRET,
    cookie: { maxAge: 300000 },
    store: new MemoryStore({
        checkPeriod: 300000
    }),
    resave: false,
    saveUninitialized: false
})) // 300000 milliseconds is 5 min
app.use(express.text({ type: 'text/plain' }))

app.get('/', async (req, res) => {
    let query = `SELECT COUNT(*) FROM ${TABLENAME_VOTE};`
    let vote_count = -1;
    await pool.query(query).then((pgres, pgerr) => {
        vote_count = pgres.rows[0].count;
    });
    let time = END_TIME_MS.toLocaleString("en-GB", { timeZone: TIMEZONE, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    if (Math.round(new Date().getTime() / 1000) > END_TIME_UNIX) {
        let query_result = `SELECT * FROM ${TABLENAME_VOTE};`
        let text = `Voting has ended on ${time} (${TIMEZONE}). Here are the unverified raw results:<br><br>`

        await pool.query(query_result).then((pgres, pgerr) => {

            for (let index = 0; index < pgres.rows.length; index++) {
                text += `${pgres.rows[index].id}<br>${pgres.rows[index].votes}<br><br>`

            }
        });
        res.render("message.ejs", {
            message: text
        });
        return;
    }

    res.render("message.ejs", {
        message: `Welcome!<br><br>${vote_count} persons have already voted till now.<br><br>After ${time} (${TIMEZONE}) all results will be listed here.<br><br>Please <a href="/signin">sign in</a> to vote.`
    });
});

app.use('/*', (req, res, next) => {
    if (Math.round(new Date().getTime() / 1000) > END_TIME_UNIX) {
        res.redirect('/');
    }
    else {
        next();
    }
});

app.get('/signin', async (req, res) => {
    const authCodeUrlParameters = {
        scopes: ["user.read"],
        redirectUri: process.env.MSAL_REDIRECT_URI,
    };

    // get url to sign user in and consent to scopes needed for application
    pca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
        res.redirect(response);
    }).catch((error) => console.log(JSON.stringify(error)));
});

app.get('/redirect', async (req, res) => {
    let text = ""

    const tokenRequest = {
        code: req.query.code,
        //scopes: ["user.read"],
        redirectUri: process.env.MSAL_REDIRECT_URI,
    };

    await pca.acquireTokenByCode(tokenRequest).then((response) => {

        req.session.name = response.account.name
        req.session.email = response.account.username

        if (ADMIN_ARRAY.indexOf(req.session.email) != -1) {
            res.render("message.ejs", {
                message: `As you are admin, you can choose to go to <a href="/vote">/vote</a> or <a href="/add">/add</a>`
            });
            return;
        }

        res.redirect("/vote")
    }).catch((error) => {
        console.log(error);
        res.render("message.ejs", {
            message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
        });
        return;
    });
});

app.get("/vote", async (req, res) => {
    if (!req.session.email) {
        console.log("no session email found")
        res.render("message.ejs", {
            message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
        });
        return;
    }

    let query = (`
        SELECT * FROM ${TABLENAME_USER} WHERE email='${req.session.email}';
    `)

    await pool.query(query).then((pgres, pgerr) => {
        if (pgerr) {
            console.error(pgerr);
            res.render("message.ejs", {
                message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
            });
            return;
        }
        try {
            if (pgres.rows.length == 0) {
                res.render("message.ejs", {
                    message: `You (authenticated as ${req.session.email}) are not allowed to vote.
                    <br><br>If you wish to be authenticated using another email, Please open <a href="/">homepage</a> in an incognito window and try again.
                    <br><br>If you think this is a mistake, please contact ${ADMIN_ARRAY[0]} for details.`
                });
                return;
            }
            else {
                if (pgres.rows[0].voted) {
                    //console.log(pgres)
                    res.render("message.ejs", {
                        message: `You (${req.session.email}) have already voted.<br><a href="/">Go back to homepage.</a>`
                    });
                    return;

                }
                else {
                    //console.log(pgres)
                    res.render('vote.ejs', {
                        email: req.session.email
                    });
                    return;
                }
            }
        } catch (error) {
            console.log(error);
            res.render("message.ejs", {
                message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
            });
            return;
        }
    });
})

app.post("/vote", async (req, res) => {
    if (!req.session.email) {
        console.log("no session email found")
        res.render("message.ejs", {
            message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
        });
        return;
    }

    let toInsert = String(req.body).replace(/[\"\'\{\}\/\\[\]\:\|\<>\+\=\;\,\?\*]/g, " ")


    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(`LOCK TABLE ${TABLENAME_USER}`)

        let query = `SELECT * FROM ${TABLENAME_USER} WHERE email='${req.session.email}'`
        await client.query(query).then((pgres, pgerr) => {
            if (pgerr) {
                console.error(pgerr);
                throw "Something went wrong. Please try again.";
            }
            if (pgres.rows.length == 0) {
                throw "You are not allowed to vote.";
            }
            if (pgres.rows[0].voted) {
                throw "You have already voted.";
            }
        });

        query = `update ${TABLENAME_USER} set voted = true where email = '${req.session.email}'`
        await client.query(query).then((pgres, pgerr) => {
            if (pgerr) {
                console.error(pgerr);
                throw "Something went wrong. Please try again.";
            }
        });

        query = `insert into ${TABLENAME_VOTE} (votes) values ($1)`
        await client.query(query, [toInsert]).then((pgres, pgerr) => {
            if (pgerr) {
                console.error(pgerr);
                throw "Something went wrong. Please try again.";
            }
        });

        await client.query('COMMIT');
        res.status(200).send("Your vote has been saved.");
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(200).send(e);
    } finally {

        client.release()
    }

})


app.get("/add", async (req, res) => {
    if (!req.session.email) {
        console.log("no session email found")
        res.render("message.ejs", {
            message: `Something went wrong. Please open <a href="/">homepage</a> in an incognito window and try again.`
        });
        return;
    }

    if (ADMIN_ARRAY.indexOf(req.session.email) == -1) {
        res.render("message.ejs", {
            message: `You are not admin. You should not be here.`
        });
        return;
    }

    res.render('add.ejs');
    return;
})

app.post("/add", async (req, res) => {
    if (!req.session.email) {
        console.log("no session email found")
        res.status(200).send("Please open an incognito window and try again.");
        return;
    }

    if (ADMIN_ARRAY.indexOf(req.session.email) == -1) {
        res.status(200).send("You are not admin. You should not be here;");
        return;
    }

    let emailArray = (req.body.split("\n"));
    let resArray = []
    function validateEmail(email) {
        const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }
    for (let index = 0; index < emailArray.length; index++) {
        if (validateEmail(emailArray[index])) {
            resArray.push(String(emailArray[index]).toLowerCase())
        }
    }
    if (resArray.length == 0) {
        res.status(500).send("No valid email provided. Please refresh the page to retry.");
        return;
    }

    // let's assume our beloved admin will not do sql injection
    let query = `INSERT INTO ${TABLENAME_USER} (email, voted) values ('${resArray[0]}', false)`
    for (let index = 1; index < resArray.length; index++) {
        query += ` , ('${resArray[index]}', false) `
    }
    query += `ON CONFLICT DO NOTHING;`
    await pool.query(query).then(async (pgres, pgerr) => {
        if (pgerr) {
            console.log(pgerr);
            res.status(200).send("Something went wrong. Please try again.");
        }
        else {
            await new Promise((resolve => setTimeout(resolve, 1000)));
            res.status(200).send("Saved. You can now close this page.");
        }
    });


})
app.use('/*', (req, res, next) => {

    res.redirect('/');

});

app.listen(SERVER_PORT, () => console.log(`App listening on port ${SERVER_PORT}!`))
