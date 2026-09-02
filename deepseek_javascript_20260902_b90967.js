// ফাইল ১: server.js (সম্পূর্ণ আপডেটেড)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const TEMP_DIR = path.join(__dirname, 'temp');
const DATA_DIR = path.join(__dirname, 'data');
const BLOG_DIR = path.join(__dirname, 'public', 'blog');

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(BLOG_DIR);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { success: false, error: 'Too many requests' } });
app.use('/api/', apiLimiter);

function getAnalytics() {
    const file = path.join(DATA_DIR, 'analytics.json');
    if (fs.existsSync(file)) return fs.readJsonSync(file);
    return { daily: {}, total: { visitors: 0, views: 0, downloads: 0 } };
}
function saveAnalytics(data) { fs.writeJsonSync(path.join(DATA_DIR, 'analytics.json'), data, { spaces: 2 }); }

function trackVisit(req) {
    const today = new Date().toISOString().split('T')[0];
    const data = getAnalytics();
    if (!data.daily[today]) data.daily[today] = { visitors: 0, views: 0, downloads: 0, video: 0, audio: 0, thumbnail: 0, languages: { bn: 0, en: 0 }, devices: { mobile: 0, desktop: 0 } };
    data.daily[today].views += 1;
    data.total.views += 1;
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Mobile')) data.daily[today].devices.mobile += 1;
    else data.daily[today].devices.desktop += 1;
    const lang = req.path.startsWith('/en') ? 'en' : 'bn';
    data.daily[today].languages[lang] = (data.daily[today].languages[lang] || 0) + 1;
    saveAnalytics(data);
}
function trackDownload(type) {
    const today = new Date().toISOString().split('T')[0];
    const data = getAnalytics();
    if (!data.daily[today]) data.daily[today] = { visitors: 0, views: 0, downloads: 0, video: 0, audio: 0, thumbnail: 0, languages: { bn: 0, en: 0 }, devices: { mobile: 0, desktop: 0 } };
    data.daily[today].downloads += 1;
    if (type === 'video') data.daily[today].video += 1;
    else if (type === 'audio') data.daily[today].audio += 1;
    else if (type === 'thumbnail') data.daily[today].thumbnail += 1;
    data.total.downloads += 1;
    saveAnalytics(data);
}

function generateBlog() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const data = getAnalytics();
    const todayData = data.daily[dateStr] || { visitors: 0, views: 0, downloads: 0, video: 0, audio: 0, thumbnail: 0 };
    const yesterdayData = data.daily[yesterdayStr] || { visitors: 0, views: 0, downloads: 0 };
    const visitorChange = yesterdayData.visitors > 0 ? Math.round(((todayData.visitors - yesterdayData.visitors) / yesterdayData.visitors) * 100) : 0;
    const popularFeatures = [];
    if (todayData.video > 0) popularFeatures.push('ভিডিও ডাউনলোড');
    if (todayData.audio > 0) popularFeatures.push('MP3 কনভার্ট');
    if (todayData.thumbnail > 0) popularFeatures.push('থাম্বনেইল');
    const popularFeature = popularFeatures.length > 0 ? popularFeatures.join(', ') : 'সব ফিচার';
    const device = todayData.devices && todayData.devices.mobile > todayData.devices.desktop ? 'মোবাইল' : 'ডেস্কটপ';
    const bnDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
    const enDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const bnBlog = `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>দৈনিক রিপোর্ট: ${bnDate} - FB Downloader Pro</title><meta name="description" content="FB Downloader Pro এর দৈনিক ব্যবহারের রিপোর্ট। ${todayData.visitors} জন ভিজিটর, ${todayData.downloads} টি ডাউনলোড।"></head><body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;"><header><nav><a href="/">হোম</a> | <a href="/blog">ব্লগ</a> | <a href="/en/blog">English</a></nav></header><main><h1>📊 দৈনিক রিপোর্ট: ${bnDate}</h1><p>আজ ${bnDate} তারিখে আমাদের সাইটে:</p><ul><li>👥 ${todayData.visitors} জন ইউনিক ভিজিটর এসেছেন</li><li>👁️ ${todayData.views} বার পেজ ভিউ হয়েছে</li><li>⬇️ ${todayData.downloads} টি ফাইল ডাউনলোড হয়েছে</li><li>🎬 ${todayData.video} টি ভিডিও ডাউনলোড</li><li>🎵 ${todayData.audio} টি অডিও কনভার্ট</li><li>🖼️ ${todayData.thumbnail} টি থাম্বনেইল ডাউনলোড</li></ul><p>সবচেয়ে জনপ্রিয় ফিচার: ${popularFeature}</p><p>ব্যবহারকারীরা সবচেয়ে বেশি ${device} ব্যবহার করেছেন।</p><h2>📈 সাপ্তাহিক তুলনা</h2><p>গতকালের তুলনায় ভিজিটর ${visitorChange >= 0 ? 'বেড়েছে' : 'কমেছে'} ${Math.abs(visitorChange)}%।</p><h2>💡 টিপস</h2><p>উচ্চ মানের ভিডিও ডাউনলোড করতে "Best Quality" নির্বাচন করুন। অডিও ফাইলের জন্য 320 kbps নির্বাচন করুন সেরা সাউন্ড কোয়ালিটির জন্য।</p><p><a href="/">ডাউনলোডার ব্যবহার করুন</a></p></main><footer><p>© 2026 FB Downloader Pro</p></footer></body></html>`;
    const enBlog = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Daily Report: ${enDate} - FB Downloader Pro</title><meta name="description" content="Daily usage report of FB Downloader Pro. ${todayData.visitors} visitors, ${todayData.downloads} downloads."></head><body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;"><header><nav><a href="/">Home</a> | <a href="/blog">Blog</a> | <a href="/bn/blog">বাংলা</a></nav></header><main><h1>📊 Daily Report: ${enDate}</h1><p>Today on our site:</p><ul><li>👥 ${todayData.visitors} unique visitors</li><li>👁️ ${todayData.views} page views</li><li>⬇️ ${todayData.downloads} files downloaded</li><li>🎬 ${todayData.video} video downloads</li><li>🎵 ${todayData.audio} audio conversions</li><li>🖼️ ${todayData.thumbnail} thumbnail downloads</li></ul><p>Most popular feature: ${popularFeature}</p><p>Users mostly used ${device}.</p><h2>📈 Weekly Comparison</h2><p>Visitors ${visitorChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(visitorChange)}% compared to yesterday.</p><h2>💡 Tips</h2><p>Select "Best Quality" for high-quality video downloads. Choose 320 kbps for the best audio quality.</p><p><a href="/">Use the Downloader</a></p></main><footer><p>© 2026 FB Downloader Pro</p></footer></body></html>`;
    fs.writeFileSync(path.join(BLOG_DIR, `${dateStr}-bn.html`), bnBlog);
    fs.writeFileSync(path.join(BLOG_DIR, `${dateStr}-en.html`), enBlog);
    const blogsFile = path.join(DATA_DIR, 'blogs.json');
    let blogs = [];
    if (fs.existsSync(blogsFile)) blogs = fs.readJsonSync(blogsFile);
    blogs.unshift({ date: dateStr, bn: `/blog/${dateStr}-bn.html`, en: `/blog/${dateStr}-en.html` });
    fs.writeJsonSync(blogsFile, blogs, { spaces: 2 });
    updateSitemap();
    console.log('✅ Blog published:', dateStr);
}

function updateSitemap() {
    const baseUrl = process.env.APP_URL || 'https://fb-downloader-pro.onrender.com';
    const blogsFile = path.join(DATA_DIR, 'blogs.json');
    let blogs = [];
    if (fs.existsSync(blogsFile)) blogs = fs.readJsonSync(blogsFile);
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    sitemap += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/bn/</loc><priority>0.9</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/en/</loc><priority>0.9</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/about</loc><priority>0.7</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/privacy</loc><priority>0.7</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/terms</loc><priority>0.7</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/contact</loc><priority>0.7</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/faq</loc><priority>0.7</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/dmca</loc><priority>0.5</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/disclaimer</loc><priority>0.5</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/cookies</loc><priority>0.5</priority></url>\n`;
    sitemap += `  <url><loc>${baseUrl}/blog</loc><priority>0.8</priority></url>\n`;
    blogs.slice(0, 10).forEach(blog => {
        sitemap += `  <url><loc>${baseUrl}${blog.bn}</loc><priority>0.6</priority></url>\n`;
        sitemap += `  <url><loc>${baseUrl}${blog.en}</loc><priority>0.6</priority></url>\n`;
    });
    sitemap += '</urlset>';
    fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
}

cron.schedule('0 15 * * *', () => { generateBlog(); }, { timezone: 'Asia/Dhaka' });

app.get('/api/health', (req, res) => { res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }); });
app.get('/api/stats', (req, res) => { res.json({ success: true, stats: getAnalytics() }); });
app.get('/api/blogs', (req, res) => {
    const blogsFile = path.join(DATA_DIR, 'blogs.json');
    let blogs = [];
    if (fs.existsSync(blogsFile)) blogs = fs.readJsonSync(blogsFile);
    res.json({ success: true, blogs: blogs });
});

app.post('/api/download-video', async (req, res) => {
    try {
        const { url, quality = 'best' } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
        if (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com')) return res.status(400).json({ success: false, error: 'Invalid Facebook URL' });
        const id = uuidv4();
        const outputPath = path.join(TEMP_DIR, `${id}.mp4`);
        const formatMap = { '144': 'best[height<=144]', '360': 'best[height<=360]', '480': 'best[height<=480]', '720': 'best[height<=720]', '1080': 'best[height<=1080]', 'best': 'best' };
        const format = formatMap[quality] || 'best';
        await execPromise(`yt-dlp -f "${format}" -o "${outputPath}" --no-warnings --merge-output-format mp4 "${url}"`, { timeout: 300000, maxBuffer: 1024 * 1024 * 10 });
        if (!await fs.pathExists(outputPath)) throw new Error('File not created');
        trackDownload('video');
        const downloadUrl = `/api/download/${id}`;
        setTimeout(() => fs.remove(outputPath).catch(() => {}), 3600000);
        res.json({ success: true, downloadUrl, fileName: `video-${id.slice(0, 8)}.mp4` });
    } catch (error) { console.error('Download error:', error); res.status(500).json({ success: false, error: 'Download failed' }); }
});

app.post('/api/convert-audio', async (req, res) => {
    try {
        const { url, quality = '128', format = 'mp3' } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
        const id = uuidv4();
        const outputPath = path.join(TEMP_DIR, `${id}.${format}`);
        await execPromise(`yt-dlp -x --audio-format ${format} --audio-quality ${quality} -o "${outputPath}" --no-warnings "${url}"`, { timeout: 300000, maxBuffer: 1024 * 1024 * 10 });
        if (!await fs.pathExists(outputPath)) throw new Error('File not created');
        trackDownload('audio');
        const downloadUrl = `/api/download/${id}`;
        setTimeout(() => fs.remove(outputPath).catch(() => {}), 3600000);
        res.json({ success: true, audio_url: downloadUrl, downloadUrl, fileName: `audio-${id.slice(0, 8)}.${format}` });
    } catch (error) { console.error('Audio error:', error); res.status(500).json({ success: false, error: 'Conversion failed' }); }
});

app.post('/api/download-image', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
        const id = uuidv4();
        const outputTemplate = path.join(TEMP_DIR, `${id}.%(ext)s`);
        await execPromise(`yt-dlp --skip-download --write-thumbnail -o "${outputTemplate}" --no-warnings "${url}"`, { timeout: 120000 });
        const files = await fs.readdir(TEMP_DIR);
        const thumbFile = files.find(f => f.startsWith(id) && (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')));
        if (!thumbFile) throw new Error('Thumbnail not found');
        trackDownload('thumbnail');
        const downloadUrl = `/api/download/${id}`;
        const thumbPath = path.join(TEMP_DIR, thumbFile);
        setTimeout(() => fs.remove(thumbPath).catch(() => {}), 3600000);
        res.json({ success: true, image_url: downloadUrl, downloadUrl, fileName: thumbFile });
    } catch (error) { console.error('Thumbnail error:', error); res.status(500).json({ success: false, error: 'Thumbnail download failed' }); }
});

app.get('/api/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const files = await fs.readdir(TEMP_DIR);
        const file = files.find(f => f.startsWith(id));
        if (!file) return res.status(404).json({ success: false, error: 'File not found or expired' });
        const filePath = path.join(TEMP_DIR, file);
        res.download(filePath, file);
    } catch (error) { res.status(500).json({ success: false, error: 'File download failed' }); }
});

app.get('/', (req, res) => { trackVisit(req); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/bn/', (req, res) => { trackVisit(req); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/en/', (req, res) => { trackVisit(req); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/blog', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'blog.html')); });
app.get('/bn/blog', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'blog.html')); });
app.get('/en/blog', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'blog.html')); });
app.get('/about', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/privacy', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/terms', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/contact', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/faq', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/dmca', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/disclaimer', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });
app.get('/cookies', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'legal.html')); });

app.use((req, res) => { res.status(404).json({ success: false, error: 'Not found' }); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ success: false, error: 'Internal server error' }); });

setInterval(async () => {
    try {
        const files = await fs.readdir(TEMP_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > 3600000) await fs.remove(filePath);
        }
    } catch (error) { console.error('Cleanup error:', error); }
}, 1800000);

app.listen(PORT, () => { console.log(`✅ FB Downloader Pro running on port ${PORT}`); });