import * as vscode from "vscode";

import { getNonce } from "@/backend/utils/nonce";
import { buildExtensionUri } from "@/backend/utils/path";
import { Config } from "@/config";
import { ExtensionState } from "@/extensionState";
import { GitGraphViewState } from "@/types";

import { EXTENSION_NAME } from "./constant/const";
import { getWebviewLocalizedStrings } from "./l10n/webviewL10n";
import { RepoManager } from "./repoManager";

/**
 * Safely escape JSON for embedding in HTML script tags.
 * Prevents XSS by escaping characters that could break out of script context.
 */
function escapeJsonForHtml(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function buildWebviewHtml(opts: {
  webview: vscode.Webview;
  config: Config;
  extensionPath: string;
  extensionState: ExtensionState;
  repoManager: RepoManager;
}): { html: string; isGraphLoaded: boolean } {
  const { webview, config, extensionPath, extensionState, repoManager } = opts;
  const nonce = getNonce();
  const l10nStrings = getWebviewLocalizedStrings();
  const viewState: GitGraphViewState = {
    autoCenterCommitDetailsView: config.autoCenterCommitDetailsView(),
    dateFormat: config.dateFormat(),
    fetchAvatars: config.fetchAvatars() && extensionState.isAvatarStorageAvailable(),
    graphColours: config.graphColours(),
    graphStyle: config.graphStyle(),
    initialLoadCommits: config.initialLoadCommits(),
    lastActiveRepo: extensionState.getLastActiveRepo(),
    loadMoreCommits: config.loadMoreCommits(),
    locale: vscode.env.language,
    repos: repoManager.getRepos(),
    showCurrentBranchByDefault: config.showCurrentBranchByDefault()
  };

  const numRepos = Object.keys(viewState.repos).length;
  let colorVars = "",
    colorParams = "";
  for (let i = 0; i < viewState.graphColours.length; i++) {
    colorVars += "--git-graph-color" + i + ":" + viewState.graphColours[i] + "; ";
    colorParams += '[data-color="' + i + '"]{--git-graph-color:var(--git-graph-color' + i + ");} ";
  }

  const mediaUri = (file: string) =>
    webview.asWebviewUri(buildExtensionUri(extensionPath, "media", file));
  const compiledOutputUri = (file: string) =>
    webview.asWebviewUri(buildExtensionUri(extensionPath, "out", file));

  let body: string;
  if (numRepos > 0) {
    body = `<body style="${colorVars}">
		<div id="controls">
      <div id="controlFields">
			<span id="repoControl"><span class="unselectable">${vscode.l10n.t("Repo")}: </span><div id="repoSelect" class="dropdown"></div></span>
			<span id="branchControl"><span class="unselectable">${vscode.l10n.t("Branch")}: </span><div id="branchSelect" class="dropdown"></div></span>
			<label id="showRemoteBranchesControl"><input type="checkbox" id="showRemoteBranchesCheckbox" value="1" checked>${vscode.l10n.t("Show Remote Branches")}</label>
      </div>
      <div id="controlActions">
        <button id="searchBtn" class="iconBtn" title="${vscode.l10n.t("Search commits")}" aria-label="${vscode.l10n.t("Search commits")}">⌕</button>
        <button id="worktreesBtn" class="iconBtn" title="${vscode.l10n.t("Show or hide worktrees")}" aria-label="${vscode.l10n.t("Show or hide worktrees")}">⑂</button>
        <button id="terminalBtn" class="iconBtn" title="${vscode.l10n.t("Open terminal in repository")}" aria-label="${vscode.l10n.t("Open terminal in repository")}">&gt;_</button>
        <button id="fetchBtn" class="iconBtn" title="${vscode.l10n.t("Fetch repository")}" aria-label="${vscode.l10n.t("Fetch repository")}">⇣</button>
        <button id="settingsBtn" class="iconBtn" title="${vscode.l10n.t("Open Git Fleet settings")}" aria-label="${vscode.l10n.t("Open Git Fleet settings")}">⚙</button>
        <button id="refreshBtn" class="iconBtn" title="${vscode.l10n.t("Refresh")}" aria-label="${vscode.l10n.t("Refresh")}">↻</button>
      </div>
		</div>
    <div id="commitSearch" hidden><input id="commitSearchInput" type="search" placeholder="${vscode.l10n.t("Search commit messages")}"><span id="commitSearchStatus"></span><button id="commitSearchPrevious" class="iconBtn" title="${vscode.l10n.t("Previous match")}">↑</button><button id="commitSearchNext" class="iconBtn" title="${vscode.l10n.t("Next match")}">↓</button><button id="commitSearchClose" class="iconBtn" title="${vscode.l10n.t("Close search")}">×</button></div>
		<div id="content">
			<div id="commitGraph"></div>
			<div id="commitTable"></div>
		</div>
		<aside id="worktreeRail" aria-label="${vscode.l10n.t("Worktrees")}" hidden>
			<div id="worktreeHeader"></div>
			<div id="worktreeList"></div>
		</aside>
		<svg id="worktreeConnectorOverlay" aria-hidden="true"></svg>
		<div id="footer"></div>
		<ul id="contextMenu"></ul>
		<div id="dialogBacking"></div>
		<div id="dialog"></div>
		<div id="scrollShadow"></div>
		<script nonce="${nonce}">var viewState = ${escapeJsonForHtml(viewState)};</script>
		<script nonce="${nonce}">var l10n = ${escapeJsonForHtml(l10nStrings)};</script>
		<script src="${compiledOutputUri("web.min.js")}"></script>
		</body>`;
  } else {
    body = `<body class="unableToLoad" style="${colorVars}">
		<h2>${vscode.l10n.t("Unable to load Git Fleet")}</h2>
		<p>${vscode.l10n.t("Either the current workspace does not contain a Git repository, or the Git repository is not configured correctly.")}</p>
		<p>${vscode.l10n.t('If you are using a portable Git installation, make sure you have set the Visual Studio Code Setting "git.path" to the path of your portable installation (e.g. "C:\\Program Files\\Git\\bin\\git.exe" on Windows).')}</p>
		</body>`;
  }

  const html = `<!DOCTYPE html>
	<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src data:;">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link rel="stylesheet" type="text/css" href="${mediaUri("main.css")}">
			<link rel="stylesheet" type="text/css" href="${mediaUri("dropdown.css")}">
			<title>${EXTENSION_NAME}</title>
			<style>${colorParams}"</style>
		</head>
		${body}
	</html>`;

  return { html, isGraphLoaded: numRepos > 0 };
}
