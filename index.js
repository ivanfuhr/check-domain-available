import { config } from 'dotenv';
import express from 'express';
import fs from 'fs';
import pQueue from 'p-queue';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import whois from 'whois';

config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = './data';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

const queue = new pQueue({ concurrency: Number(process.env.NUM_WORKERS) });
const db = new sqlite3.Database('data/domains.db');

db.run(`
    CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY,
        domain TEXT UNIQUE,
        is_available INTEGER
    )
`);

function performWhoisLookup(combination) {
    return new Promise((resolve) => {
        whois.lookup(`${combination}.${process.env.DOMAIN}`, function (err, data) {
            if (err) {
                resolve(false);
            } else {
                const isAvailable = !data.includes('No match for');
                resolve(isAvailable);
            }
        });
    });
  }

function generateVariations(characters, length) {
    function backtrack(current) {
        if (current.length === length) {
            variations.push(current);
            return;
        }

        for (const char of characters) {
            backtrack(current + char);
        }
    }

    const variations = [];
    backtrack('');
    return variations;
}

async function checkAndInsertOrUpdateDomain(combination) {
    const isAvailable = await performWhoisLookup(combination);

    db.get('SELECT domain FROM domains WHERE domain = ?', `${combination}.com`, (err, row) => {
        if (err) {
            console.error('Error checking database:', err);
            return;
        }

        if (row) {
            db.run(
                'UPDATE domains SET is_available = ? WHERE domain = ?',
                [isAvailable ? 1 : 0, `${combination}.com`],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating database:', updateErr);
                    } else {
                        console.log(`${isAvailable ? 'Available' : 'Unavailable'} domain (updated): ${combination}.com`);
                    }
                }
            );
        } else {
            db.run(
                'INSERT INTO domains (domain, is_available) VALUES (?, ?)',
                [`${combination}.com`, isAvailable ? 1 : 0],
                (insertErr) => {
                    if (insertErr) {
                        console.error('Error inserting into database:', insertErr);
                    } else {
                        console.log(`${isAvailable ? 'Available' : 'Unavailable'} domain (inserted): ${combination}.com`);
                    }
                }
            );
        }
    });
}

const sizes = process.env.SIZES.split(',');
const combinations = sizes.reduce((acc, size) => {
    return [...acc, ...generateVariations(process.env.ALPHABET, Number(size))];
}, []);

app.use("/database", express.static(__dirname + '/data'));
app.listen(process.env.SERVER_PORT, () => console.log(`Server listening on port ${process.env.SERVER_PORT}`));

const batchSize = Number(process.env.BATCH_SIZE);
for (let i = 0; i < combinations.length; i += batchSize) {
    const batch = combinations.slice(i, i + batchSize);
    batch.forEach((combination) => {
        queue.add(() => checkAndInsertOrUpdateDomain(combination));
    });
    await queue.onIdle();
}