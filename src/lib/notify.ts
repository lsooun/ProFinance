export type ToastKind = 'success' | 'error' | 'info';

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

export const TOAST_EVENT = 'pf:toast';

export function notify(message: string, kind: ToastKind = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }));
}
