import type { MuscleGroup } from './muscle-groups'

export type Equipment = 'บาร์เบล' | 'ดัมเบล' | 'เครื่อง' | 'เคเบิล' | 'น้ำหนักตัว' | 'คีทเทิลเบล'

export interface ExerciseDef {
  id: string
  name: string
  nameTh: string
  muscleGroup: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment
  icon: string
  aliases: string[]
  instructions: string[]
}

// ฐานข้อมูลท่าออกกำลังกาย — ใช้สำหรับค้นหา/เลือกท่าแทนการพิมพ์เอง
export const EXERCISES: ExerciseDef[] = [
  // อก
  {
    id: 'bench-press',
    name: 'Bench Press',
    nameTh: 'เบนช์เพรส',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่', 'แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['เบนช์เพรส', 'บาร์เบลเบนช์เพรส', 'Flat Bench Press', 'Barbell Bench Press', 'Flat BB Bench', 'BB Bench Press', 'BB Bench'],
    instructions: [
      'นอนหงายบนม้านั่ง วางเท้าราบกับพื้น จับบาร์กว้างกว่าหัวไหล่เล็กน้อย',
      'ยกบาร์ออกจากแร็ค ควบคุมให้ลงมาแตะหน้าอกช้าๆ',
      'ดันบาร์ขึ้นจนแขนเหยียดตรง โดยไม่ล็อกข้อศอกแรงเกินไป',
    ],
  },
  {
    id: 'incline-bench-press',
    name: 'Incline Bench Press',
    nameTh: 'อินไคลน์เบนช์เพรส',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่', 'แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['อินไคลน์', 'เบนช์เพรสเอียง', 'Incline Barbell Bench Press', 'Incline BB Bench', 'Incline Press'],
    instructions: [
      'ปรับม้านั่งทำมุม 30-45 องศา จับบาร์กว้างกว่าหัวไหล่',
      'ลดบาร์ลงมาแตะช่วงอกบน ควบคุมจังหวะ',
      'ดันขึ้นจนแขนเหยียดตรง เน้นอกส่วนบน',
    ],
  },
  {
    id: 'decline-bench-press',
    name: 'Decline Bench Press',
    nameTh: 'เดคลายน์เบนช์เพรส',
    muscleGroup: 'อก',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['เดคลายน์', 'Decline Barbell Bench Press', 'Decline BB Bench'],
    instructions: [
      'ปรับม้านั่งให้หัวลาดต่ำลง ล็อกเท้าให้มั่นคง',
      'ลดบาร์ลงมาแตะช่วงอกล่าง',
      'ดันขึ้นจนแขนเหยียดตรง',
    ],
  },
  {
    id: 'dumbbell-bench-press',
    name: 'Dumbbell Bench Press',
    nameTh: 'ดัมเบลเบนช์เพรส',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่', 'แขน'],
    equipment: 'ดัมเบล',
    icon: '🏋️',
    aliases: ['ดัมเบลเบนช์', 'DB Bench Press', 'Flat DB Bench', 'DB Bench'],
    instructions: [
      'นอนหงายถือดัมเบลข้างละมือ ระดับหน้าอก',
      'ดันดัมเบลขึ้นจนแขนเหยียด ควบคุมไม่ให้ชนกันแรง',
      'ลดลงช้าๆ จนรู้สึกยืดที่หน้าอก',
    ],
  },
  {
    id: 'dumbbell-fly',
    name: 'Dumbbell Fly',
    nameTh: 'ดัมเบลฟลาย',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่'],
    equipment: 'ดัมเบล',
    icon: '🦅',
    aliases: ['ฟลาย', 'DB Fly', 'Chest Fly', 'Flyes'],
    instructions: [
      'นอนหงายถือดัมเบลเหนืออก แขนงอเล็กน้อย',
      'กางแขนลงด้านข้างจนรู้สึกยืดที่อก',
      'หุบแขนกลับมาจุดเริ่มต้นด้วยแรงจากอก',
    ],
  },
  {
    id: 'cable-crossover',
    name: 'Cable Crossover',
    nameTh: 'เคเบิลครอสโอเวอร์',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่'],
    equipment: 'เคเบิล',
    icon: '🦅',
    aliases: ['ครอสโอเวอร์', 'เคเบิลฟลาย', 'Cable Fly', 'Standing Cable Fly'],
    instructions: [
      'ยืนกึ่งกลางเครื่องเคเบิล จับมือจับทั้งสองข้างสูงกว่าหัวไหล่',
      'ดึงมือทั้งสองข้างลงมาบรรจบกันด้านหน้าลำตัว',
      'ควบคุมจังหวะกลับสู่ท่าเริ่มต้น',
    ],
  },
  {
    id: 'push-up',
    name: 'Push Up',
    nameTh: 'วิดพื้น',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่', 'แขน', 'แกนกลางลำตัว'],
    equipment: 'น้ำหนักตัว',
    icon: '🤸',
    aliases: ['พุชอัพ', 'Pushup', 'Press Up'],
    instructions: [
      'วางมือกว้างกว่าหัวไหล่เล็กน้อย ลำตัวเป็นเส้นตรง',
      'ลดตัวลงจนอกเกือบแตะพื้น',
      'ดันตัวขึ้นจนแขนเหยียดตรง',
    ],
  },
  {
    id: 'chest-dip',
    name: 'Chest Dip',
    nameTh: 'ดิปอก',
    muscleGroup: 'อก',
    secondaryMuscles: ['แขน', 'ไหล่'],
    equipment: 'น้ำหนักตัว',
    icon: '🤸',
    aliases: ['ดิป', 'Dips', 'Parallel Bar Dip'],
    instructions: [
      'จับราวคู่ ยกตัวขึ้นให้แขนเหยียดตรง',
      'โน้มตัวไปข้างหน้าเล็กน้อย ลดตัวลงช้าๆ',
      'ดันตัวขึ้นกลับสู่จุดเริ่มต้น',
    ],
  },

  // หลัง
  {
    id: 'deadlift',
    name: 'Deadlift',
    nameTh: 'เดดลิฟต์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['ขา', 'แกนกลางลำตัว'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['เดดลิฟท์', 'Conventional Deadlift', 'Barbell Deadlift', 'DL'],
    instructions: [
      'ยืนแยกเท้ากว้างเท่าสะโพก บาร์ชิดหน้าแข้ง',
      'ก้มตัวจับบาร์ หลังตรง สะโพกต่ำ',
      'ยืนขึ้นดันสะโพกไปข้างหน้า ดึงบาร์ชิดลำตัวตลอด',
    ],
  },
  {
    id: 'pull-up',
    name: 'Pull Up',
    nameTh: 'ดึงข้อ',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'น้ำหนักตัว',
    icon: '🧗',
    aliases: ['พูลอัพ', 'ชินอัพ', 'chin up', 'Pullup', 'Wide Grip Pull Up'],
    instructions: [
      'จับบาร์กว้างกว่าหัวไหล่ ห้อยตัวแขนเหยียด',
      'ดึงตัวขึ้นจนคางพ้นบาร์',
      'ลดตัวลงช้าๆ จนแขนเหยียดตรง',
    ],
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    nameTh: 'แลตพูลดาวน์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'เคเบิล',
    icon: '🧗',
    aliases: ['พูลดาวน์', 'Wide Grip Lat Pulldown', 'Pulldown'],
    instructions: [
      'นั่งจับบาร์กว้างกว่าหัวไหล่ ล็อกขาใต้เบาะ',
      'ดึงบาร์ลงมาระดับอกบน อกยื่นเล็กน้อย',
      'ควบคุมจังหวะปล่อยกลับขึ้นช้าๆ',
    ],
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    nameTh: 'บาร์เบลโรว์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['โรว์', 'Bent Over Row', 'BB Row', 'Bent-Over Barbell Row'],
    instructions: [
      'ก้มตัวประมาณ 45 องศา หลังตรง จับบาร์กว้างเท่าหัวไหล่',
      'ดึงบาร์เข้าหาลำตัวช่วงท้อง',
      'ลดบาร์ลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'dumbbell-row',
    name: 'Dumbbell Row',
    nameTh: 'ดัมเบลโรว์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'ดัมเบล',
    icon: '🏋️',
    aliases: ['วันอาร์มโรว์', 'single arm row', 'DB Row', 'One Arm Row'],
    instructions: [
      'มือและเข่าข้างหนึ่งวางบนม้านั่ง อีกข้างถือดัมเบล',
      'ดึงดัมเบลขึ้นชิดลำตัวช่วงเอว',
      'ลดลงช้าๆ จนแขนเหยียดตรง',
    ],
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    nameTh: 'ซีทเคเบิลโรว์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'เคเบิล',
    icon: '🧗',
    aliases: ['เคเบิลโรว์', 'Cable Row', 'Seated Row'],
    instructions: [
      'นั่งจับมือจับ เข่างอเล็กน้อย หลังตรง',
      'ดึงมือจับเข้าหาลำตัว หน้าอกยื่นเล็กน้อย',
      'ควบคุมจังหวะปล่อยกลับ',
    ],
  },
  {
    id: 't-bar-row',
    name: 'T-Bar Row',
    nameTh: 'ทีบาร์โรว์',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['T Bar Row'],
    instructions: [
      'ยืนคร่อมบาร์ ก้มตัวลง หลังตรง',
      'ดึงบาร์ขึ้นชิดลำตัว',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    nameTh: 'เฟซพูล',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['ไหล่'],
    equipment: 'เคเบิล',
    icon: '🧗',
    aliases: ['Cable Face Pull'],
    instructions: [
      'ตั้งเคเบิลระดับหน้า จับเชือกสองข้าง',
      'ดึงเข้าหาใบหน้า กางข้อศอกออก',
      'ควบคุมจังหวะกลับสู่จุดเริ่มต้น',
    ],
  },

  // ขา
  {
    id: 'squat',
    name: 'Squat',
    nameTh: 'สควอท',
    muscleGroup: 'ขา',
    secondaryMuscles: ['แกนกลางลำตัว'],
    equipment: 'บาร์เบล',
    icon: '🦵',
    aliases: ['สควอต', 'แบ็คสควอท', 'Back Squat', 'Barbell Squat', 'BB Squat'],
    instructions: [
      'วางบาร์บนบ่า ยืนแยกเท้ากว้างเท่าหัวไหล่',
      'ย่อตัวลงจนต้นขาขนานพื้น หลังตรง',
      'ยืนขึ้นดันผ่านส้นเท้า',
    ],
  },
  {
    id: 'front-squat',
    name: 'Front Squat',
    nameTh: 'ฟรอนต์สควอท',
    muscleGroup: 'ขา',
    secondaryMuscles: ['แกนกลางลำตัว'],
    equipment: 'บาร์เบล',
    icon: '🦵',
    aliases: ['Front Barbell Squat', 'FS'],
    instructions: [
      'วางบาร์ด้านหน้าไหล่ ข้อศอกยกสูง',
      'ย่อตัวลงจนต้นขาขนานพื้น ลำตัวตั้งตรง',
      'ยืนขึ้นดันผ่านส้นเท้า',
    ],
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    nameTh: 'เลกเพรส',
    muscleGroup: 'ขา',
    secondaryMuscles: [],
    equipment: 'เครื่อง',
    icon: '🦵',
    aliases: ['เลกเพรสส์', 'Machine Leg Press', '45 Degree Leg Press'],
    instructions: [
      'นั่งบนเครื่อง วางเท้ากว้างเท่าหัวไหล่บนแผ่นดัน',
      'งอเข่าลดแผ่นเข้าหาลำตัวจนทำมุม 90 องศา',
      'ดันแผ่นกลับออกไปโดยไม่ล็อกเข่าสุด',
    ],
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    nameTh: 'โรมาเนียนเดดลิฟต์',
    muscleGroup: 'ขา',
    secondaryMuscles: ['หลัง'],
    equipment: 'บาร์เบล',
    icon: '🦵',
    aliases: ['อาร์ดีแอล', 'rdl', 'Romanian DL', 'Stiff Leg Deadlift', 'SLDL'],
    instructions: [
      'ยืนถือบาร์ หน้าขาแนบบาร์ตลอดการเคลื่อนไหว',
      'ดันสะโพกไปด้านหลัง ก้มตัวลงจนรู้สึกยืดที่ต้นขาหลัง',
      'ดันสะโพกไปข้างหน้ายืนขึ้นกลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    nameTh: 'เลกเอ็กซ์เทนชัน',
    muscleGroup: 'ขา',
    secondaryMuscles: [],
    equipment: 'เครื่อง',
    icon: '🦵',
    aliases: ['Machine Leg Extension'],
    instructions: [
      'นั่งบนเครื่อง วางหน้าแข้งใต้เบาะรอง',
      'เหยียดขาขึ้นจนเข่าเกือบตรง',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'leg-curl',
    name: 'Leg Curl',
    nameTh: 'เลกเคิร์ล',
    muscleGroup: 'ขา',
    secondaryMuscles: [],
    equipment: 'เครื่อง',
    icon: '🦵',
    aliases: ['Lying Leg Curl', 'Seated Leg Curl', 'Hamstring Curl'],
    instructions: [
      'นอนคว่ำหรือหันตามเครื่อง วางข้อเท้าใต้เบาะรอง',
      'งอเข่าดึงเบาะเข้าหาสะโพก',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'walking-lunge',
    name: 'Walking Lunge',
    nameTh: 'วอล์กกิงลันจ์',
    muscleGroup: 'ขา',
    secondaryMuscles: ['แกนกลางลำตัว'],
    equipment: 'ดัมเบล',
    icon: '🦵',
    aliases: ['ลันจ์', 'Lunges', 'Dumbbell Lunge'],
    instructions: [
      'ถือดัมเบลข้างละมือ ก้าวเท้าไปข้างหน้ายาวๆ',
      'ย่อตัวลงจนเข่าหลังเกือบแตะพื้น',
      'ดันตัวขึ้นก้าวต่อไปด้วยขาอีกข้าง',
    ],
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    nameTh: 'บัลแกเรียนสปลิทสควอท',
    muscleGroup: 'ขา',
    secondaryMuscles: ['แกนกลางลำตัว'],
    equipment: 'ดัมเบล',
    icon: '🦵',
    aliases: ['สปลิทสควอท', 'BSS', 'Rear Foot Elevated Split Squat'],
    instructions: [
      'วางเท้าหลังบนม้านั่ง ยืนขาหน้าห่างพอสมควร',
      'ย่อตัวลงจนต้นขาหน้าขนานพื้น',
      'ดันตัวขึ้นด้วยขาหน้า',
    ],
  },
  {
    id: 'calf-raise',
    name: 'Calf Raise',
    nameTh: 'คาล์ฟเรส',
    muscleGroup: 'ขา',
    secondaryMuscles: [],
    equipment: 'เครื่อง',
    icon: '🦵',
    aliases: ['คาล์ฟ', 'Standing Calf Raise', 'Seated Calf Raise'],
    instructions: [
      'ยืนปลายเท้าบนแท่นยก ส้นเท้าลอย',
      'เขย่งปลายเท้าขึ้นสุด',
      'ลดส้นเท้าลงช้าๆ จนรู้สึกยืด',
    ],
  },
  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    nameTh: 'ฮิปทรัสต์',
    muscleGroup: 'ขา',
    secondaryMuscles: ['แกนกลางลำตัว'],
    equipment: 'บาร์เบล',
    icon: '🦵',
    aliases: ['Barbell Hip Thrust', 'Glute Bridge'],
    instructions: [
      'พิงหลังบนม้านั่ง วางบาร์เหนือสะโพก เท้าราบกับพื้น',
      'ดันสะโพกขึ้นจนลำตัวเป็นเส้นตรง',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },

  // ไหล่
  {
    id: 'shoulder-press',
    name: 'Shoulder Press',
    nameTh: 'โอเวอร์เฮดเพรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['overhead press', 'มิลิทารีเพรส', 'Overhead Press', 'OHP', 'Military Press', 'Barbell Shoulder Press'],
    instructions: [
      'ยืนหรือนั่ง จับบาร์กว้างเท่าหัวไหล่ ระดับไหปลาร้า',
      'ดันบาร์ขึ้นเหนือศีรษะจนแขนเหยียดตรง',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'Dumbbell Shoulder Press',
    nameTh: 'ดัมเบลโอเวอร์เฮดเพรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['แขน'],
    equipment: 'ดัมเบล',
    icon: '🏋️',
    aliases: ['DB Shoulder Press', 'DB Overhead Press'],
    instructions: [
      'นั่งหรือยืน ถือดัมเบลระดับหัวไหล่',
      'ดันดัมเบลขึ้นเหนือศีรษะจนแขนเหยียดตรง',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    nameTh: 'ลาเทอรัลเรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: [],
    equipment: 'ดัมเบล',
    icon: '🦅',
    aliases: ['side raise', 'DB Lateral Raise', 'Side Lateral Raise', 'Side Raise'],
    instructions: [
      'ยืนถือดัมเบลข้างลำตัว แขนงอเล็กน้อย',
      'ยกแขนขึ้นด้านข้างจนระดับหัวไหล่',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'front-raise',
    name: 'Front Raise',
    nameTh: 'ฟรอนต์เรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: [],
    equipment: 'ดัมเบล',
    icon: '🦅',
    aliases: ['DB Front Raise', 'Barbell Front Raise'],
    instructions: [
      'ยืนถือดัมเบลด้านหน้าต้นขา',
      'ยกแขนขึ้นด้านหน้าจนระดับหัวไหล่',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    nameTh: 'เรียร์เดลต์ฟลาย',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['หลัง'],
    equipment: 'ดัมเบล',
    icon: '🦅',
    aliases: ['รีเวิร์สฟลาย', 'Reverse Fly', 'Rear Delt Raise', 'Bent Over Lateral Raise'],
    instructions: [
      'ก้มตัวไปข้างหน้า ถือดัมเบลห้อยลง แขนงอเล็กน้อย',
      'กางแขนขึ้นด้านข้างจนระดับหัวไหล่',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'arnold-press',
    name: 'Arnold Press',
    nameTh: 'อาร์โนลด์เพรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['แขน'],
    equipment: 'ดัมเบล',
    icon: '🏋️',
    aliases: ['Arnold Shoulder Press'],
    instructions: [
      'นั่งถือดัมเบลหน้าไหล่ ฝ่ามือหันเข้าหาตัว',
      'ดันขึ้นพร้อมหมุนฝ่ามือออกด้านนอกจนแขนเหยียด',
      'หมุนกลับและลดลงช้าๆ',
    ],
  },
  {
    id: 'upright-row',
    name: 'Upright Row',
    nameTh: 'อัพไรท์โรว์',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['Barbell Upright Row', 'Cable Upright Row'],
    instructions: [
      'ยืนจับบาร์แคบกว่าหัวไหล่ หน้าต้นขา',
      'ดึงบาร์ขึ้นตามลำตัวจนระดับหน้าอก ข้อศอกนำ',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },

  // แขน
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    nameTh: 'บาร์เบลเคิร์ล',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'บาร์เบล',
    icon: '💪',
    aliases: ['ไบเซ็ปเคิร์ล', 'Biceps Curl', 'BB Curl', 'Standing Barbell Curl'],
    instructions: [
      'ยืนจับบาร์กว้างเท่าหัวไหล่ แขนเหยียดลง',
      'งอข้อศอกยกบาร์ขึ้นโดยไม่แกว่งตัว',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    nameTh: 'ดัมเบลเคิร์ล',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'ดัมเบล',
    icon: '💪',
    aliases: ['DB Curl', 'Standing Dumbbell Curl'],
    instructions: [
      'ยืนหรือนั่งถือดัมเบลข้างละมือ แขนเหยียดลง',
      'งอข้อศอกยกดัมเบลขึ้นสลับหรือพร้อมกัน',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    nameTh: 'แฮมเมอร์เคิร์ล',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'ดัมเบล',
    icon: '💪',
    aliases: ['DB Hammer Curl'],
    instructions: [
      'ถือดัมเบลแบบฝ่ามือหันเข้าหาลำตัวตลอด',
      'งอข้อศอกยกดัมเบลขึ้น',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'triceps-pushdown',
    name: 'Triceps Pushdown',
    nameTh: 'ไทรเซ็ปพุชดาวน์',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'เคเบิล',
    icon: '💪',
    aliases: ['พุชดาวน์', 'Cable Pushdown', 'Rope Pushdown', 'Tricep Pushdown'],
    instructions: [
      'ยืนจับบาร์เคเบิลระดับหน้าอก ข้อศอกแนบลำตัว',
      'ดันบาร์ลงจนแขนเหยียดตรง',
      'ควบคุมจังหวะกลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'skull-crusher',
    name: 'Skull Crusher',
    nameTh: 'สกัลครัชเชอร์',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'บาร์เบล',
    icon: '💪',
    aliases: ['ไลอิงไทรเซ็ปเอ็กซ์เทนชัน', 'Lying Triceps Extension', 'EZ Bar Skull Crusher'],
    instructions: [
      'นอนหงายถือบาร์เหนือหน้าอก แขนเหยียดตรง',
      'งอข้อศอกลดบาร์ลงมาใกล้หน้าผาก',
      'เหยียดแขนกลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'overhead-triceps-extension',
    name: 'Overhead Triceps Extension',
    nameTh: 'โอเวอร์เฮดไทรเซ็ปเอ็กซ์เทนชัน',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'ดัมเบล',
    icon: '💪',
    aliases: ['DB Overhead Extension', 'Tricep Extension'],
    instructions: [
      'ยืนหรือนั่งถือดัมเบลเหนือศีรษะด้วยสองมือ',
      'งอข้อศอกลดดัมเบลลงด้านหลังศีรษะ',
      'เหยียดแขนกลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'close-grip-bench-press',
    name: 'Close-Grip Bench Press',
    nameTh: 'โคลสกริปเบนช์เพรส',
    muscleGroup: 'แขน',
    secondaryMuscles: ['อก'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['Close Grip Bench', 'CGBP'],
    instructions: [
      'นอนหงาย จับบาร์แคบกว่าหัวไหล่เล็กน้อย',
      'ลดบาร์ลงมาแตะหน้าอก ข้อศอกแนบลำตัว',
      'ดันบาร์ขึ้นจนแขนเหยียดตรง',
    ],
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    nameTh: 'พรีชเชอร์เคิร์ล',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'บาร์เบล',
    icon: '💪',
    aliases: ['EZ Bar Preacher Curl'],
    instructions: [
      'นั่งวางแขนบนเบาะพรีชเชอร์ จับบาร์หรือดัมเบล',
      'งอข้อศอกยกขึ้นโดยไม่ยกต้นแขนออกจากเบาะ',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },

  // แกนกลางลำตัว
  {
    id: 'plank',
    name: 'Plank',
    nameTh: 'แพลงก์',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: ['ไหล่'],
    equipment: 'น้ำหนักตัว',
    icon: '🧘',
    aliases: ['Front Plank'],
    instructions: [
      'วางแขนท่อนล่างและปลายเท้าบนพื้น ลำตัวเป็นเส้นตรง',
      'เกร็งหน้าท้อง ก้นไม่ยกไม่ยุบ',
      'ค้างท่าตามเวลาที่กำหนด',
    ],
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    nameTh: 'แฮงกิงเลกเรส',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: ['แขน'],
    equipment: 'น้ำหนักตัว',
    icon: '🧗',
    aliases: ['Leg Raise', 'Hanging Knee Raise'],
    instructions: [
      'ห้อยตัวจับบาร์ แขนเหยียดตรง',
      'ยกขาขึ้นจนทำมุมฉากหรือสูงกว่า โดยไม่แกว่งตัว',
      'ลดลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    nameTh: 'เคเบิลครันช์',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: [],
    equipment: 'เคเบิล',
    icon: '🧘',
    aliases: ['Kneeling Cable Crunch'],
    instructions: [
      'คุกเข่าหน้าเครื่องเคเบิล จับเชือกไว้ข้างศีรษะ',
      'ก้มตัวงอสะโพกเข้าหาเข่า เกร็งหน้าท้อง',
      'กลับสู่จุดเริ่มต้นช้าๆ',
    ],
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    nameTh: 'รัสเซียนทวิสต์',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: [],
    equipment: 'น้ำหนักตัว',
    icon: '🧘',
    aliases: ['Weighted Russian Twist'],
    instructions: [
      'นั่งเอนตัวเล็กน้อย ยกเท้าลอยจากพื้น',
      'หมุนลำตัวไปด้านข้างสลับซ้ายขวา',
      'ควบคุมจังหวะตลอดการเคลื่อนไหว',
    ],
  },
  {
    id: 'ab-wheel-rollout',
    name: 'Ab Wheel Rollout',
    nameTh: 'แอบวีลโรลเอาต์',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: ['ไหล่'],
    equipment: 'น้ำหนักตัว',
    icon: '🧘',
    aliases: ['Ab Rollout'],
    instructions: [
      'คุกเข่าจับล้อ วางไว้ด้านหน้าลำตัว',
      'กลิ้งล้อออกไปข้างหน้าจนลำตัวเกือบขนานพื้น',
      'ดึงกลับสู่จุดเริ่มต้นด้วยแรงหน้าท้อง',
    ],
  },
  {
    id: 'sit-up',
    name: 'Sit Up',
    nameTh: 'ซิทอัพ',
    muscleGroup: 'แกนกลางลำตัว',
    secondaryMuscles: [],
    equipment: 'น้ำหนักตัว',
    icon: '🧘',
    aliases: ['Situp', 'Crunch'],
    instructions: [
      'นอนหงาย งอเข่า วางมือไขว้หน้าอกหรือข้างศีรษะ',
      'ยกลำตัวขึ้นจนนั่งตัวตรง',
      'ลดตัวลงช้าๆ กลับสู่จุดเริ่มต้น',
    ],
  },

  // ทั้งตัว
  {
    id: 'clean-and-jerk',
    name: 'Clean and Jerk',
    nameTh: 'คลีนแอนด์เจิร์ก',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['ขา', 'หลัง', 'ไหล่'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['โอลิมปิกลิฟต์', 'C&J'],
    instructions: [
      'ดึงบาร์จากพื้นขึ้นมาที่ไหล่ด้วยแรงระเบิดจากสะโพก (Clean)',
      'ย่อตัวเล็กน้อยแล้วดันบาร์ขึ้นเหนือศีรษะ (Jerk)',
      'ยืนนิ่งจนแขนเหยียดตรงและควบคุมได้',
    ],
  },
  {
    id: 'snatch',
    name: 'Snatch',
    nameTh: 'สแนตช์',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['ขา', 'หลัง', 'ไหล่'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: [],
    instructions: [
      'จับบาร์กว้าง ดึงขึ้นจากพื้นด้วยแรงระเบิดครั้งเดียว',
      'ลอดตัวลงรับบาร์เหนือศีรษะ แขนเหยียดตรง',
      'ยืนขึ้นควบคุมบาร์ให้นิ่ง',
    ],
  },
  {
    id: 'burpee',
    name: 'Burpee',
    nameTh: 'เบอร์พี',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['แกนกลางลำตัว', 'ขา'],
    equipment: 'น้ำหนักตัว',
    icon: '🤸',
    aliases: [],
    instructions: [
      'ย่อตัวลงวางมือ กระโดดเท้าไปด้านหลังเป็นท่าแพลงก์',
      'วิดพื้นหนึ่งครั้ง แล้วดึงเท้ากลับมา',
      'กระโดดขึ้นเหนือศีรษะให้สุดแรง',
    ],
  },
  {
    id: 'kettlebell-swing',
    name: 'Kettlebell Swing',
    nameTh: 'คีทเทิลเบลสวิง',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['ขา', 'หลัง'],
    equipment: 'คีทเทิลเบล',
    icon: '🏋️',
    aliases: ['KB Swing', 'Russian Kettlebell Swing'],
    instructions: [
      'ยืนแยกเท้า จับคีทเทิลเบลด้วยสองมือ',
      'ดันสะโพกไปด้านหลังแล้วเหวี่ยงคีทเทิลเบลขึ้นด้วยแรงสะโพก',
      'ควบคุมจังหวะแกว่งกลับลงระหว่างขา',
    ],
  },
  {
    id: 'farmers-carry',
    name: "Farmer's Carry",
    nameTh: 'ฟาร์มเมอร์สแครี่',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['แขน', 'แกนกลางลำตัว'],
    equipment: 'ดัมเบล',
    icon: '💪',
    aliases: ["Farmer's Walk", 'Farmer Carry'],
    instructions: [
      'ถือดัมเบลหรือคีทเทิลเบลข้างละมือ ยืนตัวตรง',
      'เดินไปข้างหน้าด้วยก้าวปกติ เกร็งแกนกลางลำตัว',
      'วางลงอย่างควบคุมเมื่อครบระยะ',
    ],
  },
  {
    id: 'thruster',
    name: 'Thruster',
    nameTh: 'ทรัสเตอร์',
    muscleGroup: 'ทั้งตัว',
    secondaryMuscles: ['ขา', 'ไหล่'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['Barbell Thruster'],
    instructions: [
      'ถือบาร์ระดับไหล่ ย่อตัวลงเป็นท่าสควอท',
      'ยืนขึ้นพร้อมดันบาร์ขึ้นเหนือศีรษะต่อเนื่อง',
      'ลดบาร์กลับสู่ระดับไหล่ ทำซ้ำ',
    ],
  },
]

function normalize(s: string) {
  return s.toLowerCase().trim()
}

export function searchExercises(query: string, limit = 8): ExerciseDef[] {
  const q = normalize(query)
  if (!q) return []
  const scored = EXERCISES.map((ex) => {
    const name = normalize(ex.name)
    const nameTh = normalize(ex.nameTh)
    const aliases = ex.aliases.map(normalize)
    let score = -1
    if (name === q || nameTh === q) score = 100
    else if (name.startsWith(q) || nameTh.startsWith(q)) score = 80
    else if (name.includes(q) || nameTh.includes(q)) score = 60
    else if (aliases.some((a) => a.includes(q))) score = 50
    return { ex, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.ex)
}

export function exercisesByMuscle(muscleGroup: string): ExerciseDef[] {
  return EXERCISES.filter((ex) => ex.muscleGroup === muscleGroup)
}

// เดา primary/secondary muscle จากชื่อที่ "พิมพ์เอง" (ไม่ได้เลือกจาก dropdown)
// รองรับหลายชื่อเรียกของท่าเดียวกัน (เช่น "Bench Press", "Barbell Bench Press", "Flat BB Bench"
// ล้วน map ไปที่ท่าเดียวกัน) โดยเทียบแบบ exact match กับ name / nameTh / aliases ทั้งหมด
// (case-insensitive, ตัดช่องว่างหัวท้าย) — ต่างจาก searchExercises ที่ใช้ partial match สำหรับ dropdown
export function findExerciseByName(query: string): ExerciseDef | undefined {
  const q = normalize(query)
  if (!q) return undefined
  return EXERCISES.find((ex) => {
    if (normalize(ex.name) === q || normalize(ex.nameTh) === q) return true
    return ex.aliases.some((a) => normalize(a) === q)
  })
}
