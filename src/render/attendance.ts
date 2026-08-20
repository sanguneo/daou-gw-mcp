import type { AttendanceMonth } from '../api/attendance.js';
import type { AttendanceActionResult, AttendanceStatus } from '../core/types.js';
import { lines, yesNo } from './common.js';

function dayFlags(day: AttendanceMonth['days'][number]): string {
  const flags: string[] = [];
  if (day.holiday) flags.push('휴일');
  if (day.tardy) flags.push('지각');
  if (day.early) flags.push('조퇴');
  if (day.absence) flags.push('결근');
  return flags.length > 0 ? ` [${flags.join(',')}]` : '';
}

export function formatAttendanceMonth(month: AttendanceMonth): string {
  const rows = month.days
    .filter((day) => !day.future)
    .map((day) => {
      const inOut = `${day.clockInTime ?? '--:--'} ~ ${day.clockOutTime ?? '--:--'}`;
      const worked = day.workingTimeStr ? ` | ${day.workingTimeStr}` : '';
      return `${day.day}(${day.dayOfWeek}) ${inOut}${worked}${dayFlags(day)}`;
    });

  return lines(
    `근태 현황 ${month.month}`,
    month.userName ? `- 대상: ${month.userName}` : null,
    `- 근무일수: ${month.counts.worked}일 | 지각 ${month.counts.tardy} | 조퇴 ${month.counts.early} | 결근 ${month.counts.absence} | 휴일 ${month.counts.holiday}`,
    `- 근무시간: 기본 ${month.totals.normal} / 연장 ${month.totals.extension} / 야간 ${month.totals.night}`,
    `- 합계: ${month.totals.total}`,
    '',
    ...rows,
  );
}

export function formatAttendanceStatus(status: AttendanceStatus): string {
  return lines(
    '근태 상태',
    `- 날짜: ${status.today}`,
    `- 근무구분: ${status.leave || '출근'}`,
    `- 공휴일: ${yesNo(status.holiday)}`,
    `- 출근: ${status.clockedIn ? '완료' : '미처리'}`,
    `- 퇴근: ${status.clockedOut ? '완료' : '미처리'}`,
    status.leaveSource ? `- 일정 출처: ${status.leaveSource}` : null,
    status.leaveEvent ? `- 일정 내용: ${status.leaveEvent}` : null,
  );
}

export function formatAttendanceAction(result: AttendanceActionResult): string {
  switch (result.status) {
    case 'done':
      return result.action === 'in' ? '출근 처리 완료\n' : '퇴근 처리 완료\n';
    case 'already':
      return result.action === 'in' ? '이미 출근 처리됨\n' : '이미 퇴근 처리됨\n';
    case 'skip':
      if (result.reason === 'not_clocked_in') return '건너뜀: 아직 출근 처리 전\n';
      if (result.reason === 'leave_or_holiday') return `건너뜀: ${result.blockedBy ?? '연차/반차/휴일'} 일정 있음\n`;
      return '건너뜀\n';
  }
}
