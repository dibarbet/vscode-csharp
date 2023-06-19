/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriConverter } from '../uriConverter';
import { FormattingOptions, TextDocumentIdentifier } from 'vscode-languageserver-protocol';
import { OnAutoInsertRequest, RoslynProtocol } from '../roslynProtocol';
import OptionProvider from '../../shared/observers/OptionProvider';
import { ILanguageClientRegistration } from '../ILanguageClientRegistration';
import { RoslynLanguageClientInstance } from '../roslynLanguageClient';
import { IDisposable } from '../../Disposable';

export class OnAutoInsertRegistration implements ILanguageClientRegistration {
    constructor(private optionProvider: OptionProvider) { }

    registerBeforeStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined {
        return undefined;
    }

    registerAfterStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined {
        let options = this.optionProvider.GetLatestOptions();
        let source = new vscode.CancellationTokenSource();
        let disposable = vscode.workspace.onDidChangeTextDocument(async e => {
            if (!options.languageServerOptions.documentSelector.includes(e.document.languageId))
            {
                return;
            }
    
            if (e.contentChanges.length > 1 || e.contentChanges.length === 0) {
                return;
            }
    
            const change = e.contentChanges[0];
    
            if (!change.range.isEmpty) {
                return;
            }
    
            const capabilities: any = languageClient.initializeResult!.capabilities;
    
            if (capabilities._vs_onAutoInsertProvider) {
                if (!capabilities._vs_onAutoInsertProvider._vs_triggerCharacters.includes(change.text)) {
                    return;
                }
    
                source.cancel();
                source = new vscode.CancellationTokenSource();
                await applyAutoInsertEdit(e, languageClient, source.token);
            }
        });

        return disposable;
    }

}

async function applyAutoInsertEdit(e: vscode.TextDocumentChangeEvent, languageClient: RoslynLanguageClientInstance, token: vscode.CancellationToken) {
    const change = e.contentChanges[0];

    // Need to add 1 since the server expects the position to be where the caret is after the last token has been inserted.
    const position = new vscode.Position(change.range.start.line, change.range.start.character + 1);
    const uri = UriConverter.serialize(e.document.uri);
    const textDocument = TextDocumentIdentifier.create(uri);
    const formattingOptions = getFormattingOptions();
    const request: RoslynProtocol.OnAutoInsertParams = { _vs_textDocument: textDocument, _vs_position: position, _vs_ch: change.text, _vs_options: formattingOptions };
    let response = await languageClient.sendRequest(OnAutoInsertRequest.type, request, token);
    if (response)
    {
        const textEdit = response._vs_textEdit;
        const startPosition = new vscode.Position(textEdit.range.start.line, textEdit.range.start.character);
        const endPosition = new vscode.Position(textEdit.range.end.line, textEdit.range.end.character);
        const docComment = new vscode.SnippetString(textEdit.newText);
        const code: any = vscode;
        const textEdits = [new code.SnippetTextEdit(new vscode.Range(startPosition, endPosition), docComment)];
        let edit = new vscode.WorkspaceEdit();
        edit.set(e.document.uri, textEdits);

        const applied = vscode.workspace.applyEdit(edit);
        if (!applied) {
            throw new Error("Tried to insert a comment but an error occurred.");
        }
    }
}

function getFormattingOptions() : FormattingOptions {
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const tabSize = editorConfig.get<number>('tabSize') ?? 4;
    const insertSpaces = editorConfig.get<boolean>('insertSpaces') ?? true;
    return FormattingOptions.create(tabSize, insertSpaces);
}