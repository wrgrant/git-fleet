import * as vscode from "vscode";

let _channel: vscode.OutputChannel | undefined;

export const logger = {
  init: (ctx: vscode.ExtensionContext) => {
    _channel = vscode.window.createOutputChannel("Git Fleet");
    ctx.subscriptions.push(_channel);
  },

  log: (msg: string) => {
    if (!_channel) {
      // eslint-disable-next-line no-console
      console.warn("[Git Fleet] log() called before initLogger()");
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace("T", " ").replace("Z", "");
    _channel.appendLine(`[${timestamp}] ${msg}`);
  }
};
