// Tax Calculation Service
// Handles tax rate lookups from various providers

import axios from 'axios';
import crypto from 'crypto';

// In-memory rate limiting store
// Key: companyId, Value: { count, windowStart }
const rateLimitStore = new Map();

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment
 * Fails fast if not set in production
 * @returns {string} Encryption key
 */
function getEncryptionKey() {
    const key = process.env.TAX_ENCRYPTION_KEY;
    if (!key) {
        // In development/test, use a warning but allow operation
        if (process.env.NODE_ENV === 'production') {
            throw new Error('TAX_ENCRYPTION_KEY environment variable is required in production');
        }
        console.warn('WARNING: TAX_ENCRYPTION_KEY not set. Using insecure default key. Set this in production!');
        return 'dev-only-insecure-key-32-bytes!';
    }
    if (key.length < 32) {
        throw new Error('TAX_ENCRYPTION_KEY must be at least 32 characters');
    }
    return key;
}

/**
 * Encrypt a string for secure storage
 * Uses unique salt per encryption for stronger security
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted text (salt:iv:encrypted format)
 */
export function encrypt(text) {
    if (!text) return null;
    const encryptionKey = getEncryptionKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.scryptSync(encryptionKey, salt, KEY_LENGTH);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Format: salt:iv:encrypted (all in hex)
    return `${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string
 * @param {string} encryptedText - Encrypted text (salt:iv:encrypted format)
 * @returns {string} Decrypted plain text
 */
export function decrypt(encryptedText) {
    if (!encryptedText) return null;
    const encryptionKey = getEncryptionKey();
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format - expected salt:iv:encrypted');
    }

    const [saltHex, ivHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const key = crypto.scryptSync(encryptionKey, salt, KEY_LENGTH);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Check if a company has exceeded their rate limit for free API
 * @param {string} companyId - Company identifier
 * @param {number} limit - Maximum requests per hour (default 100)
 * @returns {{ allowed: boolean, remaining: number, resetAt: Date }}
 */
export function checkRateLimit(companyId, limit = 100) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour window

    let record = rateLimitStore.get(companyId);

    // Create new record or reset if window expired
    if (!record || (now - record.windowStart) > windowMs) {
        record = { count: 0, windowStart: now };
        rateLimitStore.set(companyId, record);
    }

    const remaining = Math.max(0, limit - record.count);
    const resetAt = new Date(record.windowStart + windowMs);

    if (record.count >= limit) {
        return { allowed: false, remaining: 0, resetAt };
    }

    // Increment counter
    record.count++;
    rateLimitStore.set(companyId, record);

    return { allowed: true, remaining: remaining - 1, resetAt };
}

/**
 * Generate a cache key for tax rate lookup
 * @param {string} postalCode
 * @param {string} stateCode
 * @param {string} city
 * @returns {string} Location key in format "ZIP:State:City"
 */
export function generateLocationKey(postalCode, stateCode = '', city = '') {
    const normalizedCity = city ? city.toLowerCase().trim() : '';
    const normalizedState = stateCode ? stateCode.toUpperCase().trim() : '';
    return `${postalCode}:${normalizedState}:${normalizedCity}`;
}

// US state sales tax rates (2025). States not listed have 0% state sales tax.
// For county/city-level accuracy, upgrade to paid_api mode (Avalara/TaxJar).
const STATE_SALES_TAX_RATES = {
    AL: 0.04, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029,
    CT: 0.0635, DC: 0.06, FL: 0.06, GA: 0.04, HI: 0.04,
    ID: 0.06, IL: 0.0625, IN: 0.07, IA: 0.06, KS: 0.065,
    KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06, MA: 0.0625,
    MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, NE: 0.055,
    NV: 0.0685, NJ: 0.06625, NM: 0.05125, NY: 0.04, NC: 0.0475,
    ND: 0.05, OH: 0.0575, OK: 0.045, PA: 0.06, RI: 0.07,
    SC: 0.06, SD: 0.042, TN: 0.07, TX: 0.0625, UT: 0.061,
    VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05, WY: 0.04,
};

// ZIP code prefix to state mapping (first 3 digits)
const ZIP_TO_STATE = {
    '005':'NY','006':'PR','007':'PR','008':'PR','009':'PR',
    '010':'MA','011':'MA','012':'MA','013':'MA','014':'MA','015':'MA','016':'MA','017':'MA','018':'MA','019':'MA',
    '020':'MA','021':'MA','022':'MA','023':'MA','024':'MA','025':'MA','026':'MA','027':'MA',
    '028':'RI','029':'RI',
    '030':'NH','031':'NH','032':'NH','033':'NH','034':'NH','035':'NH','036':'NH','037':'NH','038':'NH',
    '039':'ME','040':'ME','041':'ME','042':'ME','043':'ME','044':'ME','045':'ME','046':'ME','047':'ME','048':'ME','049':'ME',
    '050':'VT','051':'VT','052':'VT','053':'VT','054':'VT','056':'VT','057':'VT','058':'VT','059':'VT',
    '060':'CT','061':'CT','062':'CT','063':'CT','064':'CT','065':'CT','066':'CT','067':'CT','068':'CT','069':'CT',
    '070':'NJ','071':'NJ','072':'NJ','073':'NJ','074':'NJ','075':'NJ','076':'NJ','077':'NJ','078':'NJ','079':'NJ','080':'NJ','081':'NJ','082':'NJ','083':'NJ','084':'NJ','085':'NJ','086':'NJ','087':'NJ','088':'NJ','089':'NJ',
    '100':'NY','101':'NY','102':'NY','103':'NY','104':'NY','105':'NY','106':'NY','107':'NY','108':'NY','109':'NY',
    '110':'NY','111':'NY','112':'NY','113':'NY','114':'NY','115':'NY','116':'NY','117':'NY','118':'NY','119':'NY',
    '120':'NY','121':'NY','122':'NY','123':'NY','124':'NY','125':'NY','126':'NY','127':'NY','128':'NY','129':'NY',
    '130':'NY','131':'NY','132':'NY','133':'NY','134':'NY','135':'NY','136':'NY','137':'NY','138':'NY','139':'NY','140':'NY','141':'NY','142':'NY','143':'NY','144':'NY','145':'NY','146':'NY','147':'NY','148':'NY','149':'NY',
    '150':'PA','151':'PA','152':'PA','153':'PA','154':'PA','155':'PA','156':'PA','157':'PA','158':'PA','159':'PA',
    '160':'PA','161':'PA','162':'PA','163':'PA','164':'PA','165':'PA','166':'PA','167':'PA','168':'PA','169':'PA',
    '170':'PA','171':'PA','172':'PA','173':'PA','174':'PA','175':'PA','176':'PA','177':'PA','178':'PA','179':'PA',
    '180':'PA','181':'PA','182':'PA','183':'PA','184':'PA','185':'PA','186':'PA','187':'PA','188':'PA','189':'PA','190':'PA','191':'PA','192':'PA','193':'PA','194':'PA','195':'PA','196':'PA',
    '197':'DE','198':'DE','199':'DE',
    '200':'DC','201':'VA','202':'DC','203':'DC','204':'DC','205':'DC',
    '206':'MD','207':'MD','208':'MD','209':'MD','210':'MD','211':'MD','212':'MD','214':'MD','215':'MD','216':'MD','217':'MD','218':'MD','219':'MD',
    '220':'VA','221':'VA','222':'VA','223':'VA','224':'VA','225':'VA','226':'VA','227':'VA','228':'VA','229':'VA','230':'VA','231':'VA','232':'VA','233':'VA','234':'VA','235':'VA','236':'VA','237':'VA','238':'VA','239':'VA','240':'VA','241':'VA','242':'VA','243':'VA','244':'VA','245':'VA','246':'WV',
    '247':'WV','248':'WV','249':'WV','250':'WV','251':'WV','252':'WV','253':'WV','254':'WV','255':'WV','256':'WV','257':'WV','258':'WV','259':'WV','260':'WV','261':'WV','262':'WV','263':'WV','264':'WV','265':'WV','266':'WV','267':'WV','268':'WV',
    '270':'NC','271':'NC','272':'NC','273':'NC','274':'NC','275':'NC','276':'NC','277':'NC','278':'NC','279':'NC','280':'NC','281':'NC','282':'NC','283':'NC','284':'NC','285':'NC','286':'NC','287':'NC','288':'NC','289':'NC',
    '290':'SC','291':'SC','292':'SC','293':'SC','294':'SC','295':'SC','296':'SC','297':'SC','298':'SC','299':'SC',
    '300':'GA','301':'GA','302':'GA','303':'GA','304':'GA','305':'GA','306':'GA','307':'GA','308':'GA','309':'GA','310':'GA','311':'GA','312':'GA','313':'GA','314':'GA','315':'GA','316':'GA','317':'GA','318':'GA','319':'GA',
    '320':'FL','321':'FL','322':'FL','323':'FL','324':'FL','325':'FL','326':'FL','327':'FL','328':'FL','329':'FL','330':'FL','331':'FL','332':'FL','333':'FL','334':'FL','335':'FL','336':'FL','337':'FL','338':'FL','339':'FL',
    '340':'AA',
    '350':'AL','351':'AL','352':'AL','353':'AL','354':'AL','355':'AL','356':'AL','357':'AL','358':'AL','359':'AL','360':'AL','361':'AL','362':'AL','363':'AL','364':'AL','365':'AL','366':'AL','367':'AL','368':'AL','369':'AL',
    '370':'TN','371':'TN','372':'TN','373':'TN','374':'TN','375':'TN','376':'TN','377':'TN','378':'TN','379':'TN','380':'TN','381':'TN','382':'TN','383':'TN','384':'TN','385':'TN',
    '386':'MS','387':'MS','388':'MS','389':'MS','390':'MS','391':'MS','392':'MS','393':'MS','394':'MS','395':'MS','396':'MS','397':'MS',
    '400':'KY','401':'KY','402':'KY','403':'KY','404':'KY','405':'KY','406':'KY','407':'KY','408':'KY','409':'KY','410':'KY','411':'KY','412':'KY','413':'KY','414':'KY','415':'KY','416':'KY','417':'KY','418':'KY',
    '420':'KY','421':'KY','422':'KY','423':'KY','424':'KY','425':'KY','426':'KY','427':'KY',
    '430':'OH','431':'OH','432':'OH','433':'OH','434':'OH','435':'OH','436':'OH','437':'OH','438':'OH','439':'OH','440':'OH','441':'OH','442':'OH','443':'OH','444':'OH','445':'OH','446':'OH','447':'OH','448':'OH','449':'OH','450':'OH','451':'OH','452':'OH','453':'OH','454':'OH','455':'OH','456':'OH','457':'OH','458':'OH','459':'OH',
    '460':'IN','461':'IN','462':'IN','463':'IN','464':'IN','465':'IN','466':'IN','467':'IN','468':'IN','469':'IN','470':'IN','471':'IN','472':'IN','473':'IN','474':'IN','475':'IN','476':'IN','477':'IN','478':'IN','479':'IN',
    '480':'MI','481':'MI','482':'MI','483':'MI','484':'MI','485':'MI','486':'MI','487':'MI','488':'MI','489':'MI','490':'MI','491':'MI','492':'MI','493':'MI','494':'MI','495':'MI','496':'MI','497':'MI','498':'MI','499':'MI',
    '500':'IA','501':'IA','502':'IA','503':'IA','504':'IA','505':'IA','506':'IA','507':'IA','508':'IA','509':'IA','510':'IA','511':'IA','512':'IA','513':'IA','514':'IA','515':'IA','516':'IA','520':'IA','521':'IA','522':'IA','523':'IA','524':'IA','525':'IA','526':'IA','527':'IA','528':'IA',
    '530':'WI','531':'WI','532':'WI','534':'WI','535':'WI','537':'WI','538':'WI','539':'WI','540':'WI','541':'WI','542':'WI','543':'WI','544':'WI','545':'WI','546':'WI','547':'WI','548':'WI','549':'WI',
    '550':'MN','551':'MN','553':'MN','554':'MN','556':'MN','557':'MN','558':'MN','559':'MN','560':'MN','561':'MN','562':'MN','563':'MN','564':'MN','565':'MN','566':'MN','567':'MN',
    '570':'SD','571':'SD','572':'SD','573':'SD','574':'SD','575':'SD','576':'SD','577':'SD',
    '580':'ND','581':'ND','582':'ND','583':'ND','584':'ND','585':'ND','586':'ND','587':'ND','588':'ND',
    '590':'MT','591':'MT','592':'MT','593':'MT','594':'MT','595':'MT','596':'MT','597':'MT','598':'MT','599':'MT',
    '600':'IL','601':'IL','602':'IL','603':'IL','604':'IL','605':'IL','606':'IL','607':'IL','608':'IL','609':'IL',
    '610':'IL','611':'IL','612':'IL','613':'IL','614':'IL','615':'IL','616':'IL','617':'IL','618':'IL','619':'IL',
    '620':'IL','621':'IL','622':'IL','623':'IL','624':'IL','625':'IL','626':'IL','627':'IL','628':'IL','629':'IL',
    '630':'MO','631':'MO','633':'MO','634':'MO','635':'MO','636':'MO','637':'MO','638':'MO','639':'MO',
    '640':'KS','641':'MO','644':'MO','645':'MO','646':'MO','647':'MO','648':'MO','649':'MO','650':'MO','651':'MO','652':'MO','653':'MO','654':'MO','655':'MO','656':'MO','657':'MO','658':'MO',
    '660':'KS','661':'KS','662':'KS','664':'KS','665':'KS','666':'KS','667':'KS','668':'KS','669':'KS','670':'KS','671':'KS','672':'KS','673':'KS','674':'KS','675':'KS','676':'KS','677':'KS','678':'KS','679':'KS',
    '680':'NE','681':'NE','683':'NE','684':'NE','685':'NE','686':'NE','687':'NE','688':'NE','689':'NE','690':'NE','691':'NE','692':'NE','693':'NE',
    '700':'LA','701':'LA','703':'LA','704':'LA','705':'LA','706':'LA','707':'LA','708':'LA','710':'LA','711':'LA','712':'LA','713':'LA','714':'LA',
    '716':'AR','717':'AR','718':'AR','719':'AR','720':'AR','721':'AR','722':'AR','723':'AR','724':'AR','725':'AR','726':'AR','727':'AR','728':'AR','729':'AR',
    '730':'OK','731':'OK','734':'OK','735':'OK','736':'OK','737':'OK','738':'OK','739':'OK','740':'OK','741':'OK','743':'OK','744':'OK','745':'OK','746':'OK','747':'OK','748':'OK','749':'OK',
    '750':'TX','751':'TX','752':'TX','753':'TX','754':'TX','755':'TX','756':'TX','757':'TX','758':'TX','759':'TX',
    '760':'TX','761':'TX','762':'TX','763':'TX','764':'TX','765':'TX','766':'TX','767':'TX','768':'TX','769':'TX',
    '770':'TX','771':'TX','772':'TX','773':'TX','774':'TX','775':'TX','776':'TX','777':'TX','778':'TX','779':'TX',
    '780':'TX','781':'TX','782':'TX','783':'TX','784':'TX','785':'TX','786':'TX','787':'TX','788':'TX','789':'TX','790':'TX','791':'TX','792':'TX','793':'TX','794':'TX','795':'TX','796':'TX','797':'TX','798':'TX','799':'TX',
    '800':'CO','801':'CO','802':'CO','803':'CO','804':'CO','805':'CO','806':'CO','807':'CO','808':'CO','809':'CO','810':'CO','811':'CO','812':'CO','813':'CO','814':'CO','815':'CO','816':'CO',
    '820':'WY','821':'WY','822':'WY','823':'WY','824':'WY','825':'WY','826':'WY','827':'WY','828':'WY','829':'WY','830':'WY','831':'ID',
    '832':'ID','833':'ID','834':'ID','835':'ID','836':'ID','837':'ID','838':'ID',
    '840':'UT','841':'UT','842':'UT','843':'UT','844':'UT','845':'UT','846':'UT','847':'UT',
    '850':'AZ','852':'AZ','853':'AZ','855':'AZ','856':'AZ','857':'AZ','859':'AZ','860':'AZ','863':'AZ','864':'AZ','865':'AZ',
    '870':'NM','871':'NM','873':'NM','874':'NM','875':'NM','877':'NM','878':'NM','879':'NM','880':'NM','881':'NM','882':'NM','883':'NM','884':'NM',
    '889':'NV','890':'NV','891':'NV','893':'NV','894':'NV','895':'NV','897':'NV','898':'NV',
    '900':'CA','901':'CA','902':'CA','903':'CA','904':'CA','905':'CA','906':'CA','907':'CA','908':'CA','910':'CA','911':'CA','912':'CA','913':'CA','914':'CA','915':'CA','916':'CA','917':'CA','918':'CA','919':'CA',
    '920':'CA','921':'CA','922':'CA','923':'CA','924':'CA','925':'CA','926':'CA','927':'CA','928':'CA','930':'CA','931':'CA','932':'CA','933':'CA','934':'CA','935':'CA','936':'CA','937':'CA','938':'CA','939':'CA',
    '940':'CA','941':'CA','942':'CA','943':'CA','944':'CA','945':'CA','946':'CA','947':'CA','948':'CA','949':'CA','950':'CA','951':'CA','952':'CA','953':'CA','954':'CA','955':'CA','956':'CA','957':'CA','958':'CA','959':'CA','960':'CA','961':'CA',
    '970':'OR','971':'OR','972':'OR','973':'OR','974':'OR','975':'OR','976':'OR','977':'OR','978':'OR','979':'OR',
    '980':'WA','981':'WA','982':'WA','983':'WA','984':'WA','985':'WA','986':'WA','988':'WA','989':'WA','990':'WA','991':'WA','992':'WA','993':'WA','994':'WA',
    '995':'AK','996':'AK','997':'AK','998':'AK','999':'AK',
};

/**
 * Look up state from ZIP code prefix
 * @param {string} postalCode
 * @returns {string|null} Two-letter state code
 */
function stateFromZip(postalCode) {
    if (!postalCode || postalCode.length < 3) return null;
    return ZIP_TO_STATE[postalCode.substring(0, 3)] || null;
}

/**
 * Get sales tax rate using built-in US state rates
 * Returns state-level rate instantly with no external API dependency.
 * For county/city-level accuracy, use paid_api mode (Avalara/TaxJar).
 * @param {string} postalCode - ZIP code
 * @param {string} [stateCode] - Optional state code (used if provided, otherwise derived from ZIP)
 * @returns {Promise<{ combinedRate: number, stateRate: number, countyRate: number, cityRate: number, source: string }>}
 */
export async function getAvalaraFreeRate(postalCode, stateCode) {
    const state = stateCode || stateFromZip(postalCode);

    if (!state) {
        throw new Error(`Cannot determine state for ZIP code: ${postalCode}`);
    }

    const rate = STATE_SALES_TAX_RATES[state] || 0;

    return {
        combinedRate: rate,
        stateRate: rate,
        countyRate: 0,
        cityRate: 0,
        specialRate: 0,
        source: `state_rate_${state}`,
        raw: { state, postalCode, rate, note: 'State-level rate only. Use paid_api for county/city rates.' }
    };
}

/**
 * Get tax rate from Avalara AvaTax Paid API
 * Street-level accuracy with full address
 * @param {Object} address - Address object
 * @param {string} address.line1 - Street address
 * @param {string} address.city - City
 * @param {string} address.state - State code
 * @param {string} address.postalCode - ZIP code
 * @param {string} address.country - Country code
 * @param {Object} credentials - API credentials
 * @param {string} credentials.accountId - Avalara account ID
 * @param {string} credentials.licenseKey - API license key (decrypted)
 * @param {string} credentials.environment - 'sandbox' or 'production'
 * @returns {Promise<{ combinedRate: number, breakdown: Object[], source: string }>}
 */
export async function getAvalaraPaidRate(address, credentials) {
    const baseUrl = credentials.environment === 'production'
        ? 'https://rest.avatax.com'
        : 'https://sandbox-rest.avatax.com';

    try {
        // Build query parameters
        const params = new URLSearchParams({
            line1: address.line1 || '',
            city: address.city || '',
            region: address.state || '',
            postalCode: address.postalCode || '',
            country: address.country || 'US'
        });

        const authString = Buffer.from(
            `${credentials.accountId}:${credentials.licenseKey}`
        ).toString('base64');

        const response = await axios.get(
            `${baseUrl}/api/v2/taxrates/byaddress?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const data = response.data;

        // Avalara returns rates as percentages, convert to decimal
        return {
            combinedRate: (parseFloat(data.totalRate) || 0) / 100,
            stateRate: null, // Detailed breakdown in rates array
            countyRate: null,
            cityRate: null,
            specialRate: null,
            breakdown: data.rates || [],
            source: 'avalara_paid',
            raw: data
        };
    } catch (error) {
        console.error('Avalara AvaTax API error:', error.response?.data || error.message);
        throw new Error(`Avalara AvaTax API failed: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * Get tax rate from TaxJar API
 * Street-level accuracy with full address
 * @param {Object} address - Address object
 * @param {string} address.line1 - Street address
 * @param {string} address.city - City
 * @param {string} address.state - State code
 * @param {string} address.postalCode - ZIP code
 * @param {string} address.country - Country code
 * @param {string} apiToken - TaxJar API token (decrypted)
 * @returns {Promise<{ combinedRate: number, stateRate: number, countyRate: number, cityRate: number, source: string }>}
 */
export async function getTaxJarRate(address, apiToken) {
    try {
        // Build query parameters
        const params = new URLSearchParams({
            country: address.country || 'US',
            zip: address.postalCode || '',
            state: address.state || '',
            city: address.city || '',
            street: address.line1 || ''
        });

        const response = await axios.get(
            `https://api.taxjar.com/v2/rates/${address.postalCode}?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const rate = response.data.rate;

        return {
            combinedRate: parseFloat(rate.combined_rate) || 0,
            stateRate: parseFloat(rate.state_rate) || 0,
            countyRate: parseFloat(rate.county_rate) || 0,
            cityRate: parseFloat(rate.city_rate) || 0,
            specialRate: parseFloat(rate.special_rate) || 0,
            source: 'taxjar',
            raw: response.data
        };
    } catch (error) {
        console.error('TaxJar API error:', error.response?.data || error.message);
        throw new Error(`TaxJar API failed: ${error.response?.data?.error || error.message}`);
    }
}

/**
 * Test API connection with provided credentials
 * @param {string} provider - 'avalara' or 'taxjar'
 * @param {Object} credentials - API credentials
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function testApiConnection(provider, credentials) {
    // Use a known test address
    const testAddress = {
        line1: '100 Ravine Lane NE',
        city: 'Bainbridge Island',
        state: 'WA',
        postalCode: '98110',
        country: 'US'
    };

    try {
        if (provider === 'avalara') {
            await getAvalaraPaidRate(testAddress, credentials);
            return { success: true, message: 'Successfully connected to Avalara AvaTax' };
        } else if (provider === 'taxjar') {
            await getTaxJarRate(testAddress, credentials.apiKey);
            return { success: true, message: 'Successfully connected to TaxJar' };
        } else {
            return { success: false, message: `Unknown provider: ${provider}` };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export default {
    encrypt,
    decrypt,
    checkRateLimit,
    generateLocationKey,
    getAvalaraFreeRate,
    getAvalaraPaidRate,
    getTaxJarRate,
    testApiConnection
};
