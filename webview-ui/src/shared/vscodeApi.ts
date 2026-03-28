import type { WebViewMessage } from './messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebViewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscodeApi: ReturnType<typeof acquireVsCodeApi> | undefined;

export function getVsCodeApi() {
  if (!vscodeApi) {
    try {
      vscodeApi = acquireVsCodeApi();
    } catch {
      // Running outside VSCode (dev mode)
      vscodeApi = {
        postMessage: (msg: WebViewMessage) => console.log('[DEV] postMessage:', msg),
        getState: () => null,
        setState: (state: unknown) => console.log('[DEV] setState:', state),
      };
    }
  }
  return vscodeApi;
}

export function postMessage(message: WebViewMessage) {
  getVsCodeApi().postMessage(message);
}
