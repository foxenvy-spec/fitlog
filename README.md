# FITLOG

แอปบันทึกสถิติการออกกำลังกาย (เวทเทรนนิ่ง + คาร์ดิโอ) เป็น Progressive Web App (PWA) — ติดตั้งบนมือถือได้เหมือนแอปจริง เปิดใช้แบบออฟไลน์บางส่วนได้

สร้างด้วย **Next.js 14** (App Router) + **Supabase** (Auth + Database) และ deploy บน **Vercel**

---

## 1. โครงสร้างระบบ

- **Vercel** — โฮสต์และ deploy เว็บแอป ให้ใครก็เข้าดูผ่านลิงก์ออนไลน์ได้
- **Supabase** — ฐานข้อมูล Postgres + ระบบ Login (อีเมล/รหัสผ่าน) พร้อม Row Level Security ป้องกันไม่ให้เห็นข้อมูลของคนอื่น

## 2. ตั้งค่า Supabase

1. ไปที่ https://supabase.com สร้างบัญชี แล้วกด **New Project**
2. ตั้งชื่อโปรเจกต์ เลือก region ที่ใกล้ (เช่น Singapore) ตั้งรหัสผ่านฐานข้อมูล แล้วรอสร้างเสร็จ (~2 นาที)
3. ไปที่เมนู **SQL Editor** → **New query** → คัดลอกทั้งหมดจากไฟล์ `supabase/schema.sql` ในโปรเจกต์นี้ แล้ววางรัน (กด Run)
   - จะได้ตาราง `workouts` พร้อม Row Level Security ที่ทำให้แต่ละคนเห็นแค่ข้อมูลของตัวเอง
4. ไปที่ **Project Settings → API** คัดลอกค่า 2 ค่านี้เก็บไว้:
   - `Project URL`
   - `anon public` key
5. (แนะนำ) ไปที่ **Authentication → Providers → Email** ปิด "Confirm email" ได้ถ้าต้องการให้สมัครแล้วใช้ได้ทันทีโดยไม่ต้องกดยืนยันอีเมล เหมาะกับแอปที่ใช้กันเองในครอบครัว/เพื่อน

## 3. รันในเครื่องตัวเอง (ทดสอบก่อน deploy)

ต้องมี Node.js 18+ ติดตั้งไว้

```bash
# แตกไฟล์โปรเจกต์แล้วเข้าไปในโฟลเดอร์
cd fitlog

# ติดตั้ง dependencies
npm install

# สร้างไฟล์ env จากตัวอย่าง
cp .env.local.example .env.local
```

เปิดไฟล์ `.env.local` แล้วใส่ค่าจาก Supabase ที่คัดลอกไว้ในข้อ 2:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

จากนั้นรัน:

```bash
npm run dev
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` — ควรเจอหน้า Login/สมัครสมาชิก

> หมายเหตุ: PWA (offline / install บนมือถือ) ต้องทดสอบผ่าน `npm run build && npm run start` หรือหลัง deploy จริง เพราะ service worker ทำงานเต็มรูปแบบเฉพาะ production build

## 3.5 รัน Unit Test

Logic คำนวณของ dashboard (streak, volume, calories, PR suggestion, recovery %, insight) อยู่ใน `lib/dashboardStats.ts` และมี test คู่กันที่ `lib/dashboardStats.test.ts` ส่วน logic ของ AI Coach (สมดุล Push/Pull, Progressive Overload จาก RPE) อยู่ใน `lib/aiCoach.ts` พร้อม test ที่ `lib/aiCoach.test.ts`

```bash
npm test          # รันครั้งเดียว
npm run test:watch  # รันค้างไว้ ทดสอบใหม่อัตโนมัติเวลาแก้โค้ด
```

เวลาแก้หรือเพิ่ม logic ใน `dashboardStats.ts` ควรเพิ่ม/แก้ test คู่กันไปด้วย โดยเฉพาะฟังก์ชันที่อ้างอิงวันที่ปัจจุบัน (`todayStr()`) ต้อง freeze เวลาด้วย `vi.setSystemTime()` ก่อนเทส ไม่งั้นผลจะเปลี่ยนไปตามวันที่รันจริง

## 3.6 Error Tracking (Sentry)

แอปนี้ต่อกับ [Sentry](https://sentry.io) ไว้แล้ว (ไฟล์ `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`) — ถ้าไม่ตั้งค่า DSN แอปจะรันปกติแค่ไม่มีการรายงาน error ออกไปไหน

วิธีเปิดใช้งาน:
1. สร้างโปรเจกต์ใหม่ใน Sentry เลือกแพลตฟอร์ม Next.js
2. คัดลอก DSN มาใส่ใน `.env.local` ที่ `NEXT_PUBLIC_SENTRY_DSN`
3. (ไม่บังคับ แต่แนะนำ) ใส่ `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` เพื่อให้ตอน build อัปโหลด source maps ไปด้วย stack trace ใน Sentry จะ map กลับไฟล์ต้นฉบับได้ (ไม่ใช่แค่ minified code)

Error ที่จะถูกส่งไป Sentry อัตโนมัติ:
- ทุก Supabase query ที่ล้มเหลว (ผ่าน React Query's global error handler ใน `components/QueryProvider.tsx`)
- render error ที่ไม่ได้ดักไว้ ผ่าน `app/(app)/error.tsx` (แสดง UI แจ้งเตือนแทนหน้าขาว) และ `app/global-error.tsx`

## 4. Deploy ขึ้น Vercel

### วิธีที่ 1 — ผ่านเว็บ (ง่ายที่สุด)

1. อัปโหลดโค้ดโปรเจกต์นี้ขึ้น GitHub (สร้าง repo ใหม่ แล้ว push โค้ดทั้งหมดขึ้นไป)
2. ไปที่ https://vercel.com เข้าสู่ระบบด้วย GitHub
3. กด **Add New → Project** เลือก repo ที่เพิ่ง push ขึ้นไป
4. ในหน้า "Configure Project" เปิด **Environment Variables** แล้วใส่:
   - `NEXT_PUBLIC_SUPABASE_URL` = ค่าจาก Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ค่าจาก Supabase
5. กด **Deploy** รอสักครู่ ก็จะได้ลิงก์เว็บ เช่น `https://fitlog-xxxx.vercel.app`

### วิธีที่ 2 — ผ่าน CLI

```bash
npm install -g vercel
vercel login
vercel
# ตอบคำถามตั้งค่าตามค่าเริ่มต้นได้เลย
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## 5. ติดตั้งเป็นแอปบนมือถือ (PWA)

หลัง deploy เสร็จ เปิดลิงก์เว็บผ่านมือถือ:

- **iPhone (Safari):** กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) → เลือก "เพิ่มไปยังหน้าจอโฮม"
- **Android (Chrome):** กดเมนู 3 จุด → "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"

จะได้ไอคอนแอป FITLOG บนหน้าจอโฮม เปิดแล้วเต็มจอเหมือนแอปจริง

## 6. ฟีเจอร์ในแอป

- **บันทึก** — จดเวทเทรนนิ่ง (ท่า/กล้ามเนื้อที่ใช้/เซ็ต/reps/น้ำหนัก/RPE) หรือคาร์ดิโอ (ประเภท/ระยะทาง/เวลา) ดูรายการของวันนั้นได้ทันที ลบได้ พร้อมแจ้งเตือนอัตโนมัติเมื่อทำ **PR (สถิติส่วนตัวใหม่)** ในท่านั้นๆ, ปุ่ม **คัดลอกจากครั้งก่อน** และปุ่มลัดปรับน้ำหนัก ±1/±2.5 กก.
- **ปฏิทิน + เป้าหมาย** — ปฏิทินรายเดือนพร้อมจุดบอกวันที่มีเวท/คาร์ดิโอ แตะดูรายการวันนั้น, แถบ **🔥 Streak** (จำนวนวันออกกำลังกายต่อเนื่อง) และตั้งเป้าหมาย (น้ำหนัก, Body Fat, วอลุ่มเวทรวม, ระยะทางคาร์ดิโอรวม หรือกำหนดเอง) พร้อม progress bar
- **ไทม์เมอร์** — Rest Timer, HIIT, Tabata, EMOM, AMRAP, Stopwatch (พร้อม Lap) มีเสียง beep + **Voice Coach** (พูดบอก "Go/Rest/3-2-1" ผ่าน Web Speech API มีปุ่มปิด/เปิด) และ **Wake Lock** กันหน้าจอดับขณะจับเวลา ปรับค่าได้ทุกโหมด
- **สถิติ** — Total Volume, Total Reps, Weekly Volume (8 สัปดาห์ล่าสุด), Muscle Distribution ตามกลุ่มกล้ามเนื้อ, **Estimated 1RM Trend** (สูตร Epley เลือกท่าได้), Personal Records ต่อท่า, กราฟระยะทางคาร์ดิโอ และท่าที่ทำบ่อยที่สุด
- **สุขภาพร่างกาย** — บันทึกน้ำหนัก, Body Fat, Muscle Mass, รอบเอว/อก/สะโพก คำนวณ BMI อัตโนมัติ (ใส่ส่วนสูงครั้งเดียว) กราฟแนวโน้มน้ำหนัก และ Progress Photo พร้อมเปรียบเทียบ Before/After
- **AI Coach** (`/coach`) — วิเคราะห์และให้คำแนะนำจากประวัติการฝึกของคุณเอง (rule-based ทั้งหมด ไม่ได้เรียก AI ภายนอก):
  - **สมดุลกล้ามเนื้อ (Push/Pull)** — เทียบเซ็ตฝั่งดัน (อก/ไหล่) กับฝั่งดึง (หลัง) ในสัปดาห์นี้ เตือนเมื่อฝั่งใดฝั่งหนึ่งเยอะกว่าอีกฝั่งมากเกินไป (เสี่ยงไหล่ห่อ/ท่าทางเสีย) พร้อม insight เดิมที่เทียบวอลุ่มแต่ละกลุ่มกล้ามเนื้อกับค่าเฉลี่ยของกลุ่มอื่น
  - **Progressive Overload** — วิเคราะห์ RPE เฉลี่ยของ 3 ครั้งล่าสุดต่อท่า (ถ้ามีบันทึกไว้) เพื่อแนะนำว่าควร "เพิ่มน้ำหนัก" (RPE เบา), "เพิ่ม reps ก่อน" (RPE กลางๆ) หรือ "ลดน้ำหนัก/deload" (RPE หนักต่อเนื่อง) แทนการเพิ่มน้ำหนักตายตัวทุกครั้ง
  - **สรุปคำแนะนำวันนี้** — รวม Recovery + สมดุลกล้ามเนื้อ เป็นประโยคเดียว โชว์เป็นการ์ดบนหน้า Dashboard (เปิด/ปิดได้ที่ปุ่ม ⚙️) และลิงก์ไปหน้า AI Coach แบบเต็ม
- **ค้นหาท่าออกกำลังกาย** (`/exercises` และตอนบันทึกใน `/log`) — ค้นหาได้ทั้งชื่ออังกฤษ/ไทย/alias พร้อมตัวกรองตามหมวดหมู่กล้ามเนื้อ (Chest/Back/Legs/Shoulders/Arms/Core) มีปุ่มสลับป้ายชื่อหมวดหมู่ ไทย/EN (จำค่าไว้ในเครื่อง ใช้ร่วมกันทั้งหน้าค้นหาและตอนบันทึกเวท) — ข้อมูลที่บันทึกลงฐานข้อมูลยังเป็นภาษาไทยเหมือนเดิม เปลี่ยนแค่ตอนแสดงผล
- **ประวัติ** — ดูย้อนหลังทั้งหมด กรองตามประเภทได้ จัดกลุ่มตามวันที่ พร้อมปุ่ม **Export CSV** ดาวน์โหลดข้อมูลทั้งหมดออกไปเปิดใน Excel/Sheets (ลิงก์เข้าถึงหน้านี้ได้จากหน้าบันทึก/สถิติ/ปฏิทิน)
- **Login แยกบัญชี** — แต่ละคนสมัครและเห็นแค่ข้อมูลของตัวเอง (ป้องกันด้วย Row Level Security ที่ระดับฐานข้อมูล และ Storage policy สำหรับรูปภาพ)

> **หมายเหตุ:** Voice Coach ใช้ Web Speech API ของเบราว์เซอร์ฝั่งผู้ใช้ (ไม่มีค่าใช้จ่าย ไม่ส่งข้อมูลออกไปไหน) รองรับ Chrome/Edge/Safari ส่วนใหญ่ ถ้าเบราว์เซอร์ไม่รองรับจะเงียบไปเฉยๆ ไม่ error, และ Wake Lock (Screen Wake Lock API) รองรับ Chrome/Edge/Android เต็มที่ ส่วน iOS Safari รองรับตั้งแต่ iOS 16.4 ขึ้นไป

> **สำคัญ:** ถ้าคุณเคยรัน `schema.sql` เวอร์ชันเก่าไปแล้ว ให้กลับไปที่ Supabase SQL Editor แล้วรันไฟล์ `supabase/schema.sql` เวอร์ชันใหม่นี้ซ้ำอีกครั้ง (รันซ้ำได้อย่างปลอดภัย) เพื่อสร้างตาราง/คอลัมน์ใหม่ที่ฟีเจอร์เหล่านี้ต้องใช้ (`profiles`, `body_metrics`, `progress_photos`, `goals`, คอลัมน์ `muscle_group` และ `rpe`, และ storage bucket `progress-photos`)

## 7. โครงสร้างไฟล์สำคัญ

```
app/
  login/page.tsx          หน้าเข้าสู่ระบบ/สมัครสมาชิก
  (app)/layout.tsx         โครงแอปหลัก (top bar + bottom nav) หลัง login แล้ว
  (app)/log/page.tsx       หน้าบันทึก
  (app)/history/page.tsx   หน้าประวัติ
  (app)/stats/page.tsx     หน้าสถิติ/กราฟ
  (app)/recovery/page.tsx  หน้า Recovery รายกลุ่มกล้ามเนื้อแบบเต็ม
  (app)/coach/page.tsx     หน้า AI Coach (สมดุลกล้ามเนื้อ + Progressive Overload)
lib/aiCoach.ts             Logic วิเคราะห์สมดุล Push/Pull และแนะนำ Progressive Overload จาก RPE (มี test คู่กันที่ aiCoach.test.ts)
lib/supabase/             ตัวเชื่อมต่อ Supabase (ฝั่ง browser และ server)
middleware.ts              ป้องกันหน้าที่ต้อง login ก่อนเข้า
supabase/schema.sql        SQL สร้างตารางฐานข้อมูล + Row Level Security
public/manifest.json       PWA manifest
public/sw.js                Service worker (แคชหน้าเว็บให้เปิดออฟไลน์ได้บางส่วน)
```

## 8. ปรับแต่งต่อได้

- เพิ่มฟิลด์อื่น เช่น ค่า RPE, ส่วนสูง/น้ำหนักตัว → เพิ่มคอลัมน์ใน `supabase/schema.sql` แล้วอัปเดตฟอร์มใน `app/(app)/log/page.tsx`
- เปลี่ยนสี/ฟอนต์ → แก้ที่ `tailwind.config.js` และ `app/layout.tsx`
- เพิ่มกราฟอื่น → ใช้ไลบรารี `recharts` ที่ติดตั้งไว้แล้วในหน้า `stats/page.tsx`
