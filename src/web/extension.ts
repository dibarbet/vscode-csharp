// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as dotnet from '../../../omnisharp-roslyn/artifacts/publish/OmniSharp.WebAssembly.Driver/net6.0/dotnet';

//declare const WebAssembly: any;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    const boot = dotnet.boot();
    const compilerLogUri = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: 'Select compiler log', filters: { 'Compiler Logs': ['compilerlog'] } });
    await boot;

    const compilerLogArray = await vscode.workspace.fs.readFile(compilerLogUri[0]);

    const result = await dotnet.OmniSharp.WebAssembly.Driver.InitializeAsync(compilerLogArray);
    console.log(result);
}

// this method is called when your extension is deactivated
export function deactivate() { }
