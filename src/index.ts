import express, { Request, Response } from 'express'
import puppeteer from 'puppeteer'
import fs from 'fs/promises'
import cors from 'cors'

const app = express()
const PORT = 3000
const RATE_FILE = './rate.json'
const TEN_MINUTES = 10 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000
let lastManualRefresh = 0

app.use(cors())

const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu'
]

function formatDate(date: Date) {
    const pad = (n: number) => (n < 10 ? '0' + n : n)
    return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes()) +
        ':' +
        pad(date.getSeconds())
    )
}

async function fetchUsdRate() {
    const browser = await puppeteer.launch({
        headless: true,
        args: browserArgs
    })
    const page = await browser.newPage()
    try {
        await page.goto('https://www.kebhana.com/cms/rate/index.do?contentUrl=/cms/rate/wpfxd651_01i.do', {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForSelector('table.tblBasic tbody tr', { timeout: 15000 })
        const rates = await page.$$eval('table.tblBasic tbody tr', rows =>
            rows.map(row => {
                const tds = Array.from(row.querySelectorAll('td'))
                return {
                    currency: tds[0]?.textContent?.trim() ?? '',
                    exchangeRate: tds[8]?.textContent?.trim() ?? ''
                }
            })
        )
        const usdRate = rates.find(r => r.currency.includes('USD'))
        const now = new Date()
        return {
            currency: usdRate?.currency ?? 'USD',
            exchangeRate: usdRate?.exchangeRate ?? null,
            datetime: formatDate(now)
        }
    } catch (fail) {
        console.error('Fail fetching USD rate:', fail)
        return null
    } finally {
        await browser.close()
    }
}

async function saveUsdRateToFile() {
    const data = await fetchUsdRate()
    if (data) {
        await fs.writeFile(RATE_FILE, JSON.stringify(data, null, 2))
        console.log('USD rate saved at', data.datetime)
    }
}

app.get('/api/usd-rate', async (req: Request, res: Response) => {
    try {
        const jsonStr = await fs.readFile(RATE_FILE, 'utf-8')
        const data = JSON.parse(jsonStr)
        res.json(data)
    } catch {
        res.status(500).json({ fail: 'Failed to read rate data' })
    }
})

app.post('/api/usd-rate/refresh', async (req: Request, res: Response) => {
    const now = Date.now()
    if (now - lastManualRefresh < TEN_MINUTES) {
        const secondsLeft = Math.ceil((TEN_MINUTES - (now - lastManualRefresh)) / 1000)
        res.status(429).json({
            status: 'fail',
            message: 'Please wait before refreshing again',
            secondsLeft
        })
        return
    }
    const data = await fetchUsdRate()
    if (data) {
        await fs.writeFile(RATE_FILE, JSON.stringify(data, null, 2))
        lastManualRefresh = now
        res.json({
            status: 'success',
            message: 'USD rate refreshed successfully',
            data,
            nextAvailable: formatDate(new Date(now + TEN_MINUTES))
        })
    } else {
        res.status(500).json({
            status: 'fail',
            message: 'Failed to fetch exchange rate'
        })
    }
})

app.get('/api/stock/:ticker', async (req: Request, res: Response) => {
    const symbol = req.params.ticker.toUpperCase()
    const browser = await puppeteer.launch({
        headless: true,
        args: browserArgs
    })
    const page = await browser.newPage()

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    )
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        })
    })

    try {
        await page.goto(`https://finance.yahoo.com/quote/${symbol}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        })
        await page.waitForSelector('span[data-testid="qsp-price"]', { timeout: 15000 })
        const price = await page.$eval('span[data-testid="qsp-price"]', el => el.textContent?.trim() ?? '')
        await page.waitForSelector('span[data-testid="qsp-price-change-percent"]', { timeout: 15000 })
        const changePercentRaw = await page.$eval('span[data-testid="qsp-price-change-percent"]', el =>
            el.textContent?.trim() ?? ''
        )
        const changePercent = changePercentRaw.replace(/[()]/g, '')
        res.json({
            ticker: symbol,
            price,
            changePercent
        })
    } catch (fail) {
        console.error(`Error fetching stock for ${symbol}:`, fail)
        res.status(500).json({
            status: 'fail',
            message: `Unable to fetch stock data for ${symbol}`
        })
    } finally {
        await browser.close()
    }
})

app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`)
    saveUsdRateToFile()
    setInterval(saveUsdRateToFile, ONE_HOUR)
})
