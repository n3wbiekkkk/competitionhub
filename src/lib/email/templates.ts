function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function passwordResetEmail(link: string) {
  const subject = "ลิงก์รีเซ็ตรหัสผ่าน TechComp Hub";
  const text = `ใช้ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ภายใน 30 นาที:\n${link}\nหากไม่ได้ขอ กรุณาเพิกเฉย`;
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6"><h2>รีเซ็ตรหัสผ่าน</h2><p>ใช้ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ภายใน 30 นาที</p><p><a href="${esc(link)}">ตั้งรหัสผ่านใหม่</a></p><p>หากคุณไม่ได้ขอ กรุณาเพิกเฉยอีเมลนี้</p></div>`;
  return { subject, text, html };
}

export function teamAssignedEmail(teamName: string, competitionTitle: string) {
  const subject = `คุณถูกจัดเข้าทีม ${teamName}`;
  const text = `อาจารย์จัดคุณเข้าทีม ${teamName} สำหรับ ${competitionTitle} แล้ว ดูรายละเอียดใน TechComp Hub`;
  const html = `<div style="font-family:system-ui,sans-serif"><h2>คุณถูกจัดเข้าทีม</h2><p><strong>${esc(teamName)}</strong> สำหรับ ${esc(competitionTitle)}</p></div>`;
  return { subject, text, html };
}

export function deadlineReminderEmail(title: string, deadlineTh: string) {
  const subject = `ใกล้ปิดรับสมัคร: ${title}`;
  const text = `การแข่งขัน ${title} ปิดรับสมัคร ${deadlineTh} ตรวจสอบประกาศต้นทางก่อนสมัคร`;
  const html = `<div style="font-family:system-ui,sans-serif"><h2>ใกล้ปิดรับสมัคร</h2><p>${esc(title)} · ${esc(deadlineTh)}</p></div>`;
  return { subject, text, html };
}
