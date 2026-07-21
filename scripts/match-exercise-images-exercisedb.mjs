// scripts/match-exercise-images-exercisedb.mjs
//
// รันสคริปต์นี้ "ในเครื่องของคุณ" (ต้องมีอินเทอร์เน็ต — เครื่องมือของ Claude ที่สร้างไฟล์นี้ไม่มีเน็ต
// จึงเดา URL รูปเองไม่ได้ เพราะเสี่ยงได้ลิงก์ผิด/ตาย) สคริปต์จะ:
//   1. ดึงรายชื่อท่าทั้งหมดจาก ExerciseDB V1 API (Free/OSS version) — ฟรี ไม่ต้องสมัคร ไม่ต้องมี API key
//      เอกสาร: https://docs.ascendapi.com/products/edb-v1/overview
//      Endpoint: https://oss.exercisedb.dev/api/v1/exercises
//      รูปที่ได้เป็น "GIF สาธิตท่า" (180p) ไม่ใช่ภาพ 3D ไฮไลต์กล้ามเนื้อแบบแอปพวก Strong/Hevy
//      (ของแบบนั้นเป็นภาพลิขสิทธิ์ของผู้ให้บริการแต่ละเจ้า ไม่มีเวอร์ชันฟรีให้ดึงมาใช้ตรงๆ)
//      แต่ข้อดีคือ GIF ของ ExerciseDB ตรงกับ "ท่า" การออกกำลังกายแต่ละท่าเป๊ะกว่ารูปนิ่งจาก free-exercise-db เดิม
//   2. จับคู่ชื่ออังกฤษของแต่ละท่าใน EXERCISES ด้านล่างกับชื่อใน dataset แบบ normalize + token overlap
//      (ตรรกะเดียวกับ scripts/match-exercise-images.mjs เดิม)
//   3. เขียนไฟล์ 2 อัน:
//      - supabase/migrations/025_exercise_library_images_exercisedb.sql → อัปเดต image_url เป็น GIF (เฉพาะคู่ที่มั่นใจ)
//      - scripts/match-exercise-images-exercisedb.unmatched.json      → รายการที่จับคู่ไม่ได้
//
// วิธีรัน (Node.js 18+):
//   node scripts/match-exercise-images-exercisedb.mjs
//
// หมายเหตุ: API นี้เป็น free tier ของ ascendapi.com/ExerciseDB — ไม่มี SLA และอาจมี rate limit
// ถ้าโหลดครั้งเดียวไม่ครบ (บาง API แบ่งหน้า) สคริปต์จะไล่ดึงทีละหน้าด้วย ?page=&limit= จนกว่าจะไม่มีข้อมูลใหม่เพิ่ม
// ปลอดภัยที่จะรันซ้ำ — เขียนทับไฟล์เดิมทุกครั้ง

const API_BASE = 'https://oss.exercisedb.dev/api/v1/exercises'

const EXERCISES = [
  // ===== อก (เดิม 8 + ใหม่ 37) =====
  { id: 'bench-press', name: 'Bench Press' },
  { id: 'cable-crossover', name: 'Cable Crossover' },
  { id: 'chest-dip', name: 'Chest Dip' },
  { id: 'decline-bench-press', name: 'Decline Bench Press' },
  { id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press' },
  { id: 'dumbbell-fly', name: 'Dumbbell Fly' },
  { id: 'incline-bench-press', name: 'Incline Bench Press' },
  { id: 'push-up', name: 'Push Up' },
  { id: 'floor-press-barbell', name: 'Barbell Floor Press' },
  { id: 'guillotine-press', name: 'Guillotine Press' },
  { id: 'spoto-press', name: 'Spoto Press' },
  { id: 'larsen-press', name: 'Larsen Press' },
  { id: 'wide-grip-bench-press', name: 'Wide-Grip Bench Press' },
  { id: 'reverse-grip-bench-press', name: 'Reverse-Grip Bench Press' },
  { id: 'pin-press-barbell', name: 'Pin Press' },
  { id: 'incline-dumbbell-press', name: 'Incline Dumbbell Press' },
  { id: 'decline-dumbbell-press', name: 'Decline Dumbbell Press' },
  { id: 'incline-dumbbell-fly', name: 'Incline Dumbbell Fly' },
  { id: 'decline-dumbbell-fly', name: 'Decline Dumbbell Fly' },
  { id: 'single-arm-dumbbell-bench-press', name: 'Single-Arm Dumbbell Bench Press' },
  { id: 'dumbbell-floor-press', name: 'Dumbbell Floor Press' },
  { id: 'dumbbell-pullover', name: 'Dumbbell Pullover' },
  { id: 'svend-press', name: 'Svend Press' },
  { id: 'neutral-grip-dumbbell-press', name: 'Neutral-Grip Dumbbell Press' },
  { id: 'machine-chest-press', name: 'Machine Chest Press' },
  { id: 'pec-deck-fly', name: 'Pec Deck Fly' },
  { id: 'incline-machine-chest-press', name: 'Incline Machine Chest Press' },
  { id: 'decline-machine-chest-press', name: 'Decline Machine Chest Press' },
  { id: 'smith-machine-bench-press', name: 'Smith Machine Bench Press' },
  { id: 'smith-machine-incline-press', name: 'Smith Machine Incline Press' },
  { id: 'hammer-strength-chest-press', name: 'Hammer Strength Chest Press' },
  { id: 'low-to-high-cable-fly', name: 'Low-to-High Cable Fly' },
  { id: 'high-to-low-cable-fly', name: 'High-to-Low Cable Fly' },
  { id: 'single-arm-cable-crossover', name: 'Single-Arm Cable Crossover' },
  { id: 'standing-cable-chest-press', name: 'Standing Cable Chest Press' },
  { id: 'cable-fly-flat', name: 'Cable Fly (Flat)' },
  { id: 'single-arm-cable-fly', name: 'Single-Arm Cable Fly' },
  { id: 'incline-push-up', name: 'Incline Push Up' },
  { id: 'decline-push-up', name: 'Decline Push Up' },
  { id: 'diamond-push-up', name: 'Diamond Push Up' },
  { id: 'wide-grip-push-up', name: 'Wide-Grip Push Up' },
  { id: 'archer-push-up', name: 'Archer Push Up' },
  { id: 'weighted-dip', name: 'Weighted Dip' },
  { id: 'plyometric-push-up', name: 'Plyometric Push Up' },
  { id: 'deficit-push-up', name: 'Deficit Push Up' },
  // ===== หลัง / ขา / ไหล่ / แขน / core / ทั้งตัว (เดิม 45) =====
  { id: 'ab-wheel-rollout', name: 'Ab Wheel Rollout' },
  { id: 'cable-crunch', name: 'Cable Crunch' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise' },
  { id: 'plank', name: 'Plank' },
  { id: 'russian-twist', name: 'Russian Twist' },
  { id: 'sit-up', name: 'Sit Up' },
  { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat' },
  { id: 'calf-raise', name: 'Calf Raise' },
  { id: 'front-squat', name: 'Front Squat' },
  { id: 'hip-thrust', name: 'Hip Thrust' },
  { id: 'leg-curl', name: 'Leg Curl' },
  { id: 'leg-extension', name: 'Leg Extension' },
  { id: 'leg-press', name: 'Leg Press' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift' },
  { id: 'squat', name: 'Squat' },
  { id: 'walking-lunge', name: 'Walking Lunge' },
  { id: 'barbell-curl', name: 'Barbell Curl' },
  { id: 'close-grip-bench-press', name: 'Close-Grip Bench Press' },
  { id: 'dumbbell-curl', name: 'Dumbbell Curl' },
  { id: 'hammer-curl', name: 'Hammer Curl' },
  { id: 'overhead-triceps-extension', name: 'Overhead Triceps Extension' },
  { id: 'preacher-curl', name: 'Preacher Curl' },
  { id: 'skull-crusher', name: 'Skull Crusher' },
  { id: 'triceps-pushdown', name: 'Triceps Pushdown' },
  { id: 'burpee', name: 'Burpee' },
  { id: 'clean-and-jerk', name: 'Clean and Jerk' },
  { id: 'farmers-carry', name: "Farmer's Carry" },
  { id: 'kettlebell-swing', name: 'Kettlebell Swing' },
  { id: 'snatch', name: 'Snatch' },
  { id: 'thruster', name: 'Thruster' },
  { id: 'barbell-row', name: 'Barbell Row' },
  { id: 'deadlift', name: 'Deadlift' },
  { id: 'dumbbell-row', name: 'Dumbbell Row' },
  { id: 'face-pull', name: 'Face Pull' },
  { id: 'lat-pulldown', name: 'Lat Pulldown' },
  { id: 'pull-up', name: 'Pull Up' },
  { id: 'seated-cable-row', name: 'Seated Cable Row' },
  { id: 't-bar-row', name: 'T-Bar Row' },
  { id: 'arnold-press', name: 'Arnold Press' },
  { id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press' },
  { id: 'front-raise', name: 'Front Raise' },
  { id: 'lateral-raise', name: 'Lateral Raise' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly' },
  { id: 'shoulder-press', name: 'Shoulder Press' },
  { id: 'upright-row', name: 'Upright Row' },
  // ===== หลัง (ใหม่ 35) =====
  { id: 'pendlay-row', name: 'Pendlay Row' },
  { id: 'yates-row', name: 'Yates Row' },
  { id: 'rack-pull', name: 'Rack Pull' },
  { id: 'deficit-deadlift', name: 'Deficit Deadlift' },
  { id: 'snatch-grip-deadlift', name: 'Snatch-Grip Deadlift' },
  { id: 'meadows-row', name: 'Meadows Row' },
  { id: 'kroc-row', name: 'Kroc Row' },
  { id: 'chest-supported-dumbbell-row', name: 'Chest-Supported Dumbbell Row' },
  { id: 'renegade-row', name: 'Renegade Row' },
  { id: 'dumbbell-high-pull', name: 'Dumbbell High Pull' },
  { id: 'dumbbell-deadlift', name: 'Dumbbell Deadlift' },
  { id: 'dumbbell-shrug', name: 'Dumbbell Shrug' },
  { id: 'assisted-pull-up-machine', name: 'Assisted Pull-Up Machine' },
  { id: 'plate-loaded-row-machine', name: 'Plate-Loaded Row Machine' },
  { id: 'smith-machine-bent-over-row', name: 'Smith Machine Bent-Over Row' },
  { id: 'reverse-pec-deck-row', name: 'Reverse Pec Deck' },
  { id: 'back-extension-machine', name: 'Back Extension Machine' },
  { id: 'lat-pulldown-machine', name: 'Plate-Loaded Lat Pulldown' },
  { id: 'straight-arm-pulldown', name: 'Straight-Arm Pulldown' },
  { id: 'single-arm-lat-pulldown', name: 'Single-Arm Lat Pulldown' },
  { id: 'close-grip-seated-row', name: 'Close-Grip Seated Cable Row' },
  { id: 'wide-grip-seated-row', name: 'Wide-Grip Seated Cable Row' },
  { id: 'single-arm-cable-row', name: 'Single-Arm Cable Row' },
  { id: 'cable-pullover', name: 'Cable Pullover' },
  { id: 'reverse-grip-lat-pulldown', name: 'Reverse-Grip Lat Pulldown' },
  { id: 'cable-shrug', name: 'Cable Shrug' },
  { id: 'high-cable-row', name: 'High Cable Row' },
  { id: 'chin-up', name: 'Chin-Up' },
  { id: 'inverted-row', name: 'Inverted Row' },
  { id: 'wide-grip-pull-up', name: 'Wide-Grip Pull-Up' },
  { id: 'neutral-grip-pull-up', name: 'Neutral-Grip Pull-Up' },
  { id: 'muscle-up', name: 'Muscle-Up' },
  { id: 'superman', name: 'Superman' },
  { id: 'bird-dog', name: 'Bird Dog' },
  { id: 'scapular-pull-up', name: 'Scapular Pull-Up' },
  // ===== ขา (ใหม่ 35) =====
  { id: 'box-squat', name: 'Box Squat' },
  { id: 'zercher-squat', name: 'Zercher Squat' },
  { id: 'sumo-deadlift', name: 'Sumo Deadlift' },
  { id: 'barbell-lunge', name: 'Barbell Lunge' },
  { id: 'overhead-squat', name: 'Overhead Squat' },
  { id: 'good-morning', name: 'Good Morning' },
  { id: 'barbell-step-up', name: 'Barbell Step-Up' },
  { id: 'goblet-squat', name: 'Goblet Squat' },
  { id: 'dumbbell-lunge', name: 'Dumbbell Lunge' },
  { id: 'dumbbell-step-up', name: 'Dumbbell Step-Up' },
  { id: 'dumbbell-sumo-squat', name: 'Dumbbell Sumo Squat' },
  { id: 'single-leg-romanian-deadlift', name: 'Single-Leg Romanian Deadlift' },
  { id: 'dumbbell-calf-raise', name: 'Dumbbell Calf Raise' },
  { id: 'curtsy-lunge', name: 'Curtsy Lunge' },
  { id: 'hack-squat', name: 'Hack Squat' },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl' },
  { id: 'lying-leg-curl', name: 'Lying Leg Curl' },
  { id: 'smith-machine-squat', name: 'Smith Machine Squat' },
  { id: 'standing-calf-raise-machine', name: 'Standing Calf Raise Machine' },
  { id: 'hip-abduction-machine', name: 'Hip Abduction Machine' },
  { id: 'hip-adduction-machine', name: 'Hip Adduction Machine' },
  { id: 'cable-pull-through', name: 'Cable Pull-Through' },
  { id: 'cable-squat', name: 'Cable Squat' },
  { id: 'cable-kickback', name: 'Cable Kickback' },
  { id: 'cable-hip-abduction', name: 'Cable Hip Abduction' },
  { id: 'cable-romanian-deadlift', name: 'Cable Romanian Deadlift' },
  { id: 'pistol-squat', name: 'Pistol Squat' },
  { id: 'jump-squat', name: 'Jump Squat' },
  { id: 'box-jump', name: 'Box Jump' },
  { id: 'wall-sit', name: 'Wall Sit' },
  { id: 'glute-bridge', name: 'Glute Bridge' },
  { id: 'single-leg-glute-bridge', name: 'Single-Leg Glute Bridge' },
  { id: 'step-up-bodyweight', name: 'Bodyweight Step-Up' },
  { id: 'nordic-hamstring-curl', name: 'Nordic Hamstring Curl' },
  { id: 'kettlebell-goblet-squat', name: 'Kettlebell Goblet Squat' },
  // ===== ไหล่ (ใหม่ 28) =====
  { id: 'military-press', name: 'Military Press' },
  { id: 'push-press', name: 'Push Press' },
  { id: 'behind-the-neck-press', name: 'Behind-the-Neck Press' },
  { id: 'barbell-front-raise', name: 'Barbell Front Raise' },
  { id: 'landmine-press', name: 'Landmine Press' },
  { id: 'seated-dumbbell-press', name: 'Seated Dumbbell Press' },
  { id: 'single-arm-dumbbell-press', name: 'Single-Arm Dumbbell Press' },
  { id: 'leaning-lateral-raise', name: 'Leaning Lateral Raise' },
  { id: 'incline-rear-delt-raise', name: 'Incline Rear Delt Raise' },
  { id: 'cuban-press', name: 'Cuban Press' },
  { id: 'plate-front-raise', name: 'Plate Front Raise' },
  { id: 'machine-shoulder-press', name: 'Machine Shoulder Press' },
  { id: 'machine-lateral-raise', name: 'Machine Lateral Raise' },
  { id: 'smith-machine-shoulder-press', name: 'Smith Machine Shoulder Press' },
  { id: 'plate-loaded-shoulder-press', name: 'Plate-Loaded Shoulder Press' },
  { id: 'machine-rear-delt-fly', name: 'Machine Rear Delt Fly' },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise' },
  { id: 'cable-front-raise', name: 'Cable Front Raise' },
  { id: 'cable-rear-delt-fly', name: 'Cable Rear Delt Fly' },
  { id: 'cable-y-raise', name: 'Cable Y-Raise' },
  { id: 'single-arm-cable-lateral-raise', name: 'Single-Arm Cable Lateral Raise' },
  { id: 'cable-shoulder-press', name: 'Cable Shoulder Press' },
  { id: 'cable-external-rotation', name: 'Cable External Rotation' },
  { id: 'pike-push-up', name: 'Pike Push Up' },
  { id: 'handstand-push-up', name: 'Handstand Push Up' },
  { id: 'wall-walk', name: 'Wall Walk' },
  { id: 'shoulder-tap-plank', name: 'Shoulder Tap Plank' },
  { id: 'wall-slide', name: 'Wall Slide' },
  // ===== แขน (ใหม่ 32) =====
  { id: 'ez-bar-curl', name: 'EZ-Bar Curl' },
  { id: 'reverse-barbell-curl', name: 'Reverse Barbell Curl' },
  { id: 'drag-curl', name: 'Drag Curl' },
  { id: 'jm-press', name: 'JM Press' },
  { id: 'barbell-wrist-curl', name: 'Barbell Wrist Curl' },
  { id: 'incline-dumbbell-curl', name: 'Incline Dumbbell Curl' },
  { id: 'concentration-curl', name: 'Concentration Curl' },
  { id: 'zottman-curl', name: 'Zottman Curl' },
  { id: 'spider-curl', name: 'Spider Curl' },
  { id: 'dumbbell-kickback', name: 'Dumbbell Triceps Kickback' },
  { id: 'dumbbell-wrist-curl', name: 'Dumbbell Wrist Curl' },
  { id: 'reverse-dumbbell-curl', name: 'Reverse Dumbbell Curl' },
  { id: 'cross-body-hammer-curl', name: 'Cross-Body Hammer Curl' },
  { id: 'preacher-curl-machine', name: 'Preacher Curl Machine' },
  { id: 'bicep-curl-machine', name: 'Bicep Curl Machine' },
  { id: 'triceps-extension-machine', name: 'Triceps Extension Machine' },
  { id: 'assisted-dip-machine', name: 'Assisted Dip Machine' },
  { id: 'reverse-curl-machine', name: 'Reverse Curl Machine' },
  { id: 'cable-curl', name: 'Cable Curl' },
  { id: 'rope-hammer-curl', name: 'Rope Hammer Curl' },
  { id: 'cable-overhead-triceps-extension', name: 'Cable Overhead Triceps Extension' },
  { id: 'single-arm-cable-triceps-extension', name: 'Single-Arm Cable Triceps Extension' },
  { id: 'reverse-grip-triceps-pushdown', name: 'Reverse-Grip Triceps Pushdown' },
  { id: 'cable-concentration-curl', name: 'Cable Concentration Curl' },
  { id: 'bayesian-cable-curl', name: 'Bayesian Cable Curl' },
  { id: 'cable-wrist-curl', name: 'Cable Wrist Curl' },
  { id: 'bench-dip', name: 'Bench Dip' },
  { id: 'bodyweight-curl', name: 'Bodyweight Curl' },
  { id: 'wrist-roller', name: 'Wrist Roller' },
  { id: 'plate-pinch', name: 'Plate Pinch' },
  { id: 'fingertip-push-up', name: 'Fingertip Push Up' },
  { id: 'dead-hang', name: 'Dead Hang' },
  // ===== แกนกลางลำตัว (ใหม่ 29) =====
  { id: 'barbell-rollout', name: 'Barbell Rollout' },
  { id: 'landmine-rotation', name: 'Landmine Rotation' },
  { id: 'dumbbell-side-bend', name: 'Dumbbell Side Bend' },
  { id: 'weighted-sit-up', name: 'Weighted Sit Up' },
  { id: 'dumbbell-woodchopper', name: 'Dumbbell Woodchopper' },
  { id: 'suitcase-carry', name: 'Suitcase Carry' },
  { id: 'ab-crunch-machine', name: 'Ab Crunch Machine' },
  { id: 'rotary-torso-machine', name: 'Rotary Torso Machine' },
  { id: 'captains-chair-leg-raise', name: "Captain's Chair Leg Raise" },
  { id: 'cable-woodchopper', name: 'Cable Woodchopper' },
  { id: 'cable-reverse-woodchopper', name: 'Cable Reverse Woodchopper' },
  { id: 'pallof-press', name: 'Pallof Press' },
  { id: 'cable-side-bend', name: 'Cable Side Bend' },
  { id: 'standing-cable-crunch', name: 'Standing Cable Crunch' },
  { id: 'cable-lift', name: 'Cable Lift' },
  { id: 'mountain-climber', name: 'Mountain Climber' },
  { id: 'bicycle-crunch', name: 'Bicycle Crunch' },
  { id: 'leg-raise', name: 'Lying Leg Raise' },
  { id: 'flutter-kick', name: 'Flutter Kick' },
  { id: 'v-up', name: 'V-Up' },
  { id: 'side-plank', name: 'Side Plank' },
  { id: 'hollow-body-hold', name: 'Hollow Body Hold' },
  { id: 'dead-bug', name: 'Dead Bug' },
  { id: 'toe-touch', name: 'Toe Touch' },
  { id: 'reverse-crunch', name: 'Reverse Crunch' },
  { id: 'dragon-flag', name: 'Dragon Flag' },
  { id: 'plank-up-down', name: 'Plank Up-Down' },
  { id: 'kettlebell-windmill', name: 'Kettlebell Windmill' },
  { id: 'turkish-get-up', name: 'Turkish Get-Up' },
  // ===== ทั้งตัว (ใหม่ 14) =====
  { id: 'power-clean', name: 'Power Clean' },
  { id: 'hang-clean', name: 'Hang Clean' },
  { id: 'clean-and-press', name: 'Clean and Press' },
  { id: 'dumbbell-clean-and-press', name: 'Dumbbell Clean and Press' },
  { id: 'man-maker', name: 'Man Maker' },
  { id: 'dumbbell-snatch', name: 'Dumbbell Snatch' },
  { id: 'devils-press', name: "Devil's Press" },
  { id: 'kettlebell-clean', name: 'Kettlebell Clean' },
  { id: 'kettlebell-clean-and-press', name: 'Kettlebell Clean and Press' },
  { id: 'kettlebell-snatch', name: 'Kettlebell Snatch' },
  { id: 'kettlebell-thruster', name: 'Kettlebell Thruster' },
  { id: 'bear-crawl', name: 'Bear Crawl' },
  { id: 'burpee-box-jump', name: 'Burpee Box Jump' },
  { id: 'sprawl', name: 'Sprawl' },
  // ===== อื่นๆ (ใหม่ 20) =====
  { id: 'cat-cow-stretch', name: 'Cat-Cow Stretch' },
  { id: 'worlds-greatest-stretch', name: "World's Greatest Stretch" },
  { id: 'hip-flexor-stretch', name: 'Hip Flexor Stretch' },
  { id: 'pigeon-pose', name: 'Pigeon Pose' },
  { id: 'thoracic-spine-rotation', name: 'Thoracic Spine Rotation' },
  { id: 'arm-circles', name: 'Arm Circles' },
  { id: 'leg-swings', name: 'Leg Swings' },
  { id: 'inchworm', name: 'Inchworm' },
  { id: 'jumping-jacks', name: 'Jumping Jacks' },
  { id: 'high-knees', name: 'High Knees' },
  { id: 'butt-kicks', name: 'Butt Kicks' },
  { id: 'jump-rope', name: 'Jump Rope' },
  { id: 'foam-rolling-quads', name: 'Foam Rolling (Quads)' },
  { id: 'downward-dog', name: 'Downward Dog' },
  { id: 'childs-pose', name: "Child's Pose" },
  { id: 'cossack-squat', name: 'Cossack Squat' },
  { id: 'shoulder-dislocates', name: 'Shoulder Dislocates' },
  { id: 'ankle-circles', name: 'Ankle Circles' },
  { id: 'spiderman-lunge-stretch', name: 'Spiderman Lunge Stretch' },
  { id: 'standing-quad-stretch', name: 'Standing Quad Stretch' },
  // ===== ปิดท้าย 300 ท่า (ใหม่ 17) =====
  { id: 'converging-chest-press', name: 'Converging Chest Press' },
  { id: 'single-arm-cable-chest-press', name: 'Single-Arm Cable Chest Press' },
  { id: 'seal-row', name: 'Seal Row' },
  { id: 'batwing-row', name: 'Batwing Row' },
  { id: 'belt-squat', name: 'Belt Squat' },
  { id: 'sissy-squat', name: 'Sissy Squat' },
  { id: 'z-press', name: 'Z Press' },
  { id: 'bus-driver', name: 'Bus Driver' },
  { id: 'waiter-curl', name: "Waiter's Curl" },
  { id: 'cable-skull-crusher', name: 'Cable Skull Crusher' },
  { id: 'ab-rollout-machine', name: 'Ab Rollout Machine' },
  { id: 'copenhagen-plank', name: 'Copenhagen Plank' },
  { id: 'single-arm-kettlebell-swing', name: 'Single-Arm Kettlebell Swing' },
  { id: 'sled-push', name: 'Sled Push' },
  { id: 'battle-ropes', name: 'Battle Ropes' },
  { id: 'ninety-ninety-hip-stretch', name: '90/90 Hip Stretch' },
  { id: 'seated-forward-fold', name: 'Seated Forward Fold' },
]

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[-_.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlap(a, b) {
  const ta = normalize(a).split(' ').filter(Boolean)
  const tb = normalize(b).split(' ').filter(Boolean)
  if (ta.length === 0 || tb.length === 0) return 0
  const setB = new Set(tb)
  const matched = ta.filter((t) => setB.has(t)).length
  return matched / new Set([...ta, ...tb]).size
}

// ดึงทั้งชุดโดยไล่หน้า — เผื่อ endpoint แบ่งหน้า (limit เริ่มต้นไม่ทราบแน่ชัดจาก doc สาธารณะ)
// ถ้า response ไม่มี pagination (คืนทั้งชุดในคำขอเดียว) ลูปจะหยุดตั้งแต่รอบแรกเพราะไม่มีข้อมูลใหม่
async function fetchAllExercises() {
  const collected = new Map()
  let page = 1
  const limit = 200
  const MAX_PAGES = 50 // กันลูปไม่รู้จบถ้า API พฤติกรรมไม่ตรงกับที่คาด

  while (page <= MAX_PAGES) {
    const url = `${API_BASE}?limit=${limit}&offset=${(page - 1) * limit}`
    const res = await fetch(url)
    if (!res.ok) {
      if (page === 1) throw new Error(`โหลด ExerciseDB ไม่สำเร็จ: ${res.status}`)
      break // หน้าแรกสำเร็จแล้ว หน้าเกินขอบเขตให้หยุดเงียบๆ
    }
    const body = await res.json()
    const list = Array.isArray(body) ? body : (body.data ?? body.exercises ?? [])
    if (!Array.isArray(list) || list.length === 0) break

    let addedNew = false
    for (const item of list) {
      const id = item.exerciseId ?? item.id
      if (id && !collected.has(id)) {
        collected.set(id, item)
        addedNew = true
      }
    }
    // ถ้า response ไม่รองรับ offset/limit จริง (คืนชุดเดิมซ้ำทุกครั้ง) ให้หยุด
    if (!addedNew) break
    if (list.length < limit) break // หน้าสุดท้ายแล้ว
    page += 1
  }

  return Array.from(collected.values())
}

async function main() {
  console.log('กำลังโหลด ExerciseDB (free/OSS version)...')
  const dataset = await fetchAllExercises()
  if (dataset.length === 0) throw new Error('ไม่ได้รับข้อมูลจาก ExerciseDB เลย ตรวจสอบ endpoint/เน็ตอีกที')
  console.log(`โหลดสำเร็จ ${dataset.length} ท่าจาก ExerciseDB`)

  const matched = []
  const unmatched = []

  for (const ex of EXERCISES) {
    let best = null
    let bestScore = 0
    for (const d of dataset) {
      const dName = d.name ?? ''
      const nameNorm = normalize(dName)
      const queryNorm = normalize(ex.name)
      const score = nameNorm === queryNorm ? 1 : tokenOverlap(ex.name, dName)
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    // >= 0.7 ถือว่ามั่นใจพอ (ตรงเป๊ะ หรือใกล้เคียงมาก เช่น "Bench Press" vs "Barbell Bench Press")
    const gifUrl = best?.gifUrl ?? best?.gif_url ?? null
    if (best && bestScore >= 0.7 && gifUrl) {
      matched.push({ id: ex.id, name: ex.name, matchedName: best.name, score: bestScore, gifUrl })
    } else {
      unmatched.push({ id: ex.id, name: ex.name, closest: best?.name ?? null, score: bestScore })
    }
  }

  // เขียนทับคอลัมน์ image_url เดิมด้วย GIF (ตรงท่ากว่ารูปนิ่งจาก free-exercise-db)
  // ถ้าอยากเก็บรูปนิ่งเดิมไว้ด้วย ให้เพิ่มคอลัมน์ใหม่ (เช่น demo_gif_url) แทนการ UPDATE ทับที่นี่
  const sqlRows = matched
    .map((m) => `  ('${m.id}', '${m.gifUrl.replace(/'/g, "''")}')`)
    .join(',\n')

  const sql = `-- 025_exercise_library_images_exercisedb.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images-exercisedb.mjs
-- จับคู่กับ ExerciseDB V1 API (Free/OSS, https://oss.exercisedb.dev) — GIF สาธิตท่าตรงกว่ารูปนิ่งเดิม
-- จับคู่ได้ ${matched.length}/${EXERCISES.length} ท่า (ที่เหลือดู match-exercise-images-exercisedb.unmatched.json)
-- เขียนทับ image_url เดิม (จาก free-exercise-db) ด้วย GIF ตัวใหม่ — รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
${sqlRows}
) as v(id, url)
where e.id = v.id;
`

  const fs = await import('node:fs/promises')
  await fs.writeFile('supabase/migrations/025_exercise_library_images_exercisedb.sql', sql, 'utf-8')
  await fs.writeFile(
    'scripts/match-exercise-images-exercisedb.unmatched.json',
    JSON.stringify(unmatched, null, 2),
    'utf-8'
  )

  console.log(`\nจับคู่สำเร็จ: ${matched.length}/${EXERCISES.length}`)
  console.log(`ไม่พบคู่ที่มั่นใจ: ${unmatched.length} ท่า → ดูรายชื่อใน scripts/match-exercise-images-exercisedb.unmatched.json`)
  console.log('เขียนไฟล์ supabase/migrations/025_exercise_library_images_exercisedb.sql แล้ว')
  console.log('ตรวจ GIF ที่จับคู่ได้เร็วๆ ก่อนรันจริง (บาง match อาจเป็นท่าใกล้เคียงแต่ไม่เป๊ะ 100%)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
