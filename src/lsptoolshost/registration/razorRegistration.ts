/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IDisposable } from "../../Disposable";
import { DynamicFileInfoHandler } from "../../razor/src/DynamicFile/DynamicFileInfoHandler";
import { ILanguageClientRegistration } from "../ILanguageClientRegistration";
import { RoslynLanguageClientInstance } from "../roslynLanguageClient";
import { CancellationToken, CodeAction, CodeActionParams, CodeActionRequest, CodeActionResolveRequest, CompletionItem, CompletionParams, CompletionRequest, CompletionResolveRequest, DidChangeTextDocumentNotification, DidChangeTextDocumentParams, DidCloseTextDocumentNotification, DidCloseTextDocumentParams, DocumentDiagnosticParams, DocumentDiagnosticReport, DocumentDiagnosticRequest, RequestType } from 'vscode-languageserver-protocol';
import CompositeDisposable from '../../CompositeDisposable';

export class RazorRegistration implements ILanguageClientRegistration {

    // These are commands that are invoked by the Razor extension, and are used to send LSP requests to the Roslyn LSP server
    public static readonly roslynDidOpenCommand: string = 'roslyn.openRazorCSharp';
    public static readonly roslynDidChangeCommand: string = 'roslyn.changeRazorCSharp';
    public static readonly roslynDidCloseCommand: string = 'roslyn.closeRazorCSharp';
    public static readonly roslynPullDiagnosticCommand: string = 'roslyn.pullDiagnosticRazorCSharp';
    public static readonly provideCodeActionsCommand: string = 'roslyn.provideCodeActions';
    public static readonly resolveCodeActionCommand: string = 'roslyn.resolveCodeAction';
    public static readonly provideCompletionsCommand: string = 'roslyn.provideCompletions';
    public static readonly resolveCompletionsCommand: string = 'roslyn.resolveCompletion';
    public static readonly razorInitializeCommand: string = 'razor.initialize';

    // These are notifications we will get from the LSP server and will forward to the Razor extension.
    private static readonly provideRazorDynamicFileInfoMethodName: string = 'razor/provideDynamicFileInfo';
    private static readonly removeRazorDynamicFileInfoMethodName: string = 'razor/removeDynamicFileInfo';

    registerBeforeStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined {
        return this.registerRazor(languageClient);
    }
    registerAfterStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined {
        return undefined;
    }

    private registerRazor(client: RoslynLanguageClientInstance) {
        // When the Roslyn language server sends a request for Razor dynamic file info, we forward that request along to Razor via
        // a command.
        client.onRequest(
            RazorRegistration.provideRazorDynamicFileInfoMethodName,
            async request => vscode.commands.executeCommand(DynamicFileInfoHandler.provideDynamicFileInfoCommand, request));
        client.onNotification(
            RazorRegistration.removeRazorDynamicFileInfoMethodName,
            async notification => vscode.commands.executeCommand(DynamicFileInfoHandler.removeDynamicFileInfoCommand, notification));

        let disposable = new CompositeDisposable();
        // Razor will call into us (via command) for generated file didChange/didClose notifications. We'll then forward these
        // notifications along to Roslyn. didOpen notifications are handled separately via the vscode.openTextDocument method.
        disposable.add(vscode.commands.registerCommand(RazorRegistration.roslynDidChangeCommand, (notification: DidChangeTextDocumentParams) => {
            client.sendNotification(DidChangeTextDocumentNotification.method, notification);
        }));
        disposable.add(vscode.commands.registerCommand(RazorRegistration.roslynDidCloseCommand, (notification: DidCloseTextDocumentParams) => {
            client.sendNotification(DidCloseTextDocumentNotification.method, notification);
        }));
        disposable.add(vscode.commands.registerCommand(RazorRegistration.roslynPullDiagnosticCommand, async (request: DocumentDiagnosticParams) => {
            let diagnosticRequestType = new RequestType<DocumentDiagnosticParams, DocumentDiagnosticReport, any>(DocumentDiagnosticRequest.method);
            return await client.sendRequest(diagnosticRequestType, request, CancellationToken.None);
        }));

        // The VS Code API for code actions (and the vscode.CodeAction type) doesn't support everything that LSP supports,
        // namely the data property, which Razor needs to identify which code actions are on their allow list, so we need
        // to expose a command for them to directly invoke our code actions LSP endpoints, rather than use built-in commands.
        disposable.add(vscode.commands.registerCommand(RazorRegistration.provideCodeActionsCommand, async (request: CodeActionParams) => {
            return await client.sendRequest(CodeActionRequest.type, request, CancellationToken.None);
        }));
        disposable.add(vscode.commands.registerCommand(RazorRegistration.resolveCodeActionCommand, async (request: CodeAction) => {
            return await client.sendRequest(CodeActionResolveRequest.type, request, CancellationToken.None);
        }));

        disposable.add(vscode.commands.registerCommand(RazorRegistration.provideCompletionsCommand, async (request: CompletionParams) => {
            return await client.sendRequest(CompletionRequest.type, request, CancellationToken.None);
        }));
        disposable.add(vscode.commands.registerCommand(RazorRegistration.resolveCompletionsCommand, async (request: CompletionItem) => {
            return await client.sendRequest(CompletionResolveRequest.type, request, CancellationToken.None);
        }));

        // Roslyn is responsible for producing a json file containing information for Razor, that comes from the compilation for
        // a project. We want to defer this work until necessary, so this command is called by the Razor document manager to tell
        // us when they need us to initialize the Razor things.
        disposable.add(vscode.commands.registerCommand(RazorRegistration.razorInitializeCommand, () => {
            client.sendNotification("razor/initialize", { });
        }));

        return disposable;
    }

}