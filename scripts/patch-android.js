// অ্যান্ড্রয়েড প্রজেক্ট তৈরি হওয়ার পর রিমাইন্ডারের জন্য দরকারি অনুমতিগুলো যোগ করে।
const fs = require('fs');

const file = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(file, 'utf8');

const permissions = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
  'android.permission.USE_EXACT_ALARM',
];
const lines = permissions
  .filter(p => !xml.includes(p))
  .map(p => `    <uses-permission android:name="${p}" />`);
if (!xml.includes('SCHEDULE_EXACT_ALARM')) {
  lines.push('    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />');
}

if (lines.length) {
  xml = xml.replace('</manifest>', lines.join('\n') + '\n</manifest>');
  fs.writeFileSync(file, xml);
}
console.log(`AndroidManifest: ${lines.length}টি অনুমতি যোগ হয়েছে`);

// নোটিফিকেশনের ছোট আইকন (সাদা দাঁড়িপাল্লা) — স্ট্যাটাস বারে দেখায়
const dir = 'android/app/src/main/res/drawable';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/ic_stat_case.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M11.2,4h1.6v15h-1.6z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M7,19h10v1.8h-10z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M3.5,6.2h17v1.6h-17z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M2,12.6h5.2c0,1.5 -1.2,2.7 -2.6,2.7s-2.6,-1.2 -2.6,-2.7z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M16.8,12.6h5.2c0,1.5 -1.2,2.7 -2.6,2.7s-2.6,-1.2 -2.6,-2.7z"/>
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="0.9" android:pathData="M4.6,7.5L2.6,12.6M4.6,7.5L6.6,12.6M19.4,7.5L17.4,12.6M19.4,7.5L21.4,12.6"/>
</vector>
`);
console.log('নোটিফিকেশন আইকন যোগ হয়েছে');

// স্থায়ী সাইনিং কী: প্রতিবার একই কী দিয়ে সই হয়, তাই পুরনো অ্যাপের ওপর আপডেট ইনস্টল করা যায় (আনইনস্টল লাগে না)
const gradleFile = 'android/app/build.gradle';
let gr = fs.readFileSync(gradleFile, 'utf8');
if (!gr.includes('signingConfigs.casediary')) {
  gr = gr.replace(/android \{\n/, `android {
    signingConfigs {
        casediary {
            storeFile file("\${rootProject.projectDir}/../keystore/casediary.jks")
            storePassword "casediary123"
            keyAlias "casediary"
            keyPassword "casediary123"
        }
    }
`);
  gr = gr.replace(/buildTypes \{\n/, `buildTypes {
        debug {
            signingConfig signingConfigs.casediary
        }
`);
  gr = gr.replace(/versionCode 1\n/, 'versionCode Integer.parseInt(System.getenv("GITHUB_RUN_NUMBER") ?: "1")\n');
  gr = gr.replace(/versionName "1.0"/, 'versionName "2.3"');
  fs.writeFileSync(gradleFile, gr);
}
console.log('সাইনিং কী ও ভার্সন কোড বসানো হয়েছে');
