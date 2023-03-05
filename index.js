import { Client } from "@notionhq/client";
import * as dotenv from "dotenv";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as NotionStrategy } from "passport-notion";
import sqlite3 from "sqlite3";

import notionAPICallWithRetry from "./utils.js";

dotenv.config();

const app = express();
const PORT = 4010;

app.use(
    session({
        name: "session",
        secret: "keyboard cat",
        resave: false,
        saveUninitialized: false,
    })
);

const db = new sqlite3.Database("app.db");
db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        notion_user_id TEXT,
        access_token TEXT,
        test_database_id TEXT
    )`);
});

const notionStrategy = new NotionStrategy(
    {
        clientID: process.env.NOTION_CLIENT_ID,
        clientSecret: process.env.NOTION_CLIENT_SECRET,
        callbackURL: process.env.NOTION_CALLBACK_URL,
    },
    (req, accessToken, _unknown, oauthData, userProfileData, done) => {
        const notionUserId = userProfileData.id;
        db.get(
            `SELECT * FROM users WHERE notion_user_id = ?`,
            [notionUserId],
            function (err, user) {
                if (err) {
                    done(err);
                }

                if (!user) {
                    db.run(
                        `INSERT INTO users (notion_user_id, access_token) VALUES (?, ?)`,
                        [notionUserId, accessToken],
                        function (err) {
                            if (err) {
                                done(err);
                            }
                            return done(null, {
                                id: this.lastID,
                            });
                        }
                    );
                } else {
                    done(null, user);
                }
            }
        );
    }
);

passport.use(notionStrategy);
app.use(passport.session());

passport.serializeUser((user, done) => {
    console.log("serializeUser");
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    console.log(`deserializeUser with id: ${id}`);
    db.get(`SELECT * FROM users WHERE id = ?`, [id], function (err, user) {
        done(err, user);
    });
});

app.get("/", async (req, res) => {
    if (req.user) {
        res.json(req.user);
    } else {
        res.json({
            next: "access /login",
            message: req.session.message,
        });
    }
});

app.get("/login", passport.authenticate("notion"));

app.get(
    "/callback",
    passport.authenticate("notion", {
        successRedirect: "/call",
        failureRedirect: "/",
    })
);

const searchTestDatabase = (accessToken) => {
    const notion = new Client({
        auth: accessToken,
    });
    return notion.search({
        query: "Test Database 11",
        filter: {
            value: "database",
            property: "object",
        },
    });
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.get("/call", async (req, res, next) => {
    if (!req.user) {
        res.redirect("/");
        return;
    }

    try {
        // wait 2secs before calling the Notion API
        await delay(2000);
        const response = await notionAPICallWithRetry(
            searchTestDatabase(req.user.access_token),
            10
        );

        if (response.results[0].id === req.user.test_database_id) {
            res.redirect("/");
            return;
        }

        db.run(
            `UPDATE users SET test_database_id = ? WHERE id = ?`,
            [response.results[0].id, req.user.id],
            function (err) {
                if (err) {
                    next(err);
                }
                res.json(response);
            }
        );
    } catch (error) {
        console.error(error);
        next(error);
    }
});

app.listen(PORT);
