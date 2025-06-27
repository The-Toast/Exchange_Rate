import puppeteer from 'puppeteer'
import express from 'express'
import fs from 'fs/promises'
import cors from 'cors'

const app = express()
const PORT = 3000
const RATE_FILE = './rate.json'

app.use(cors())

async function fetchUsdRate() {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    })
    const page = await browser.newPage()

    try {
        await page.goto('https://www.kebhana.com/cms/rate/index.do?contentUrl=/cms/rate/wpfxd651_01i.do', { waitUntil: 'domcontentloaded' })
        await new Promise(r => setTimeout(r, 5000))

        await page.waitForFunction(() => {
            const table = document.querySelector('table.tblBasic tbody')
            return table && table.querySelectorAll('tr').length > 0
        }, { timeout: 15000 })

        const rates = await page.$$eval('table.tblBasic tbody tr', rows =>
            rows.map(row => {
                const tds = Array.from(row.querySelectorAll('td'))
                return {
                    currency: tds[0]?.textContent?.trim() ?? '',
                    exchangeRate: tds[8]?.textContent?.trim() ?? ''
                }
            })
        )

        const usdRate = rates.find(r => r.currency.includes('미국 USD'))

        const now = new Date()

        return {
            currency: usdRate?.currency ?? 'USD',
            exchangeRate: usdRate?.exchangeRate ?? null,
            datetime: now.toISOString()
        }
    } catch (error) {
        console.error('Error fetching USD rate:', error)
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

app.get('/api/usd-rate', async (req, res) => {
    try {
        const jsonStr = await fs.readFile(RATE_FILE, 'utf-8')
        const data = JSON.parse(jsonStr)
        res.json(data)
    } catch (error) {
        res.status(500).json({ error: 'Failed to read rate data' })
    }
})

app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`)
    saveUsdRateToFile()
    setInterval(saveUsdRateToFile, 3600000)
})
