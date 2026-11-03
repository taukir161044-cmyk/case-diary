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
