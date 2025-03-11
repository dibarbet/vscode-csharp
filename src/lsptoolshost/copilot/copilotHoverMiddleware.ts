/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProvideHoverSignature } from 'vscode-languageclient/node';

interface ICopilotHoverArgs {
    message: string;
}

export function registerCopilotHoverCommand() {
    vscode.commands.registerCommand('roslyn.client.showCopilotHover', async (args: ICopilotHoverArgs) => {
        // nothing for now
        vscode.window.showErrorMessage(args.message);
        
    });
}

export async function provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    next: ProvideHoverSignature
) {
    const result = await next(document, position, token);
    if (result) {
        const generateString = vscode.l10n.t('Generate Copilot summary');
        const args: ICopilotHoverArgs = {
            message: 'Generated summary',
        };
        const loadingMarkdown = new vscode.MarkdownString(
            `$(sparkle) [${generateString}](command:roslyn.client.showCopilotHover?${encodeURIComponent(
                JSON.stringify(args)
            )})`,
            true
        );
        loadingMarkdown.isTrusted = true;
        return new vscode.Hover([...result.contents, loadingMarkdown]);
    }

    return result;
}
