/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';

 export async function startTrace(): Promise<void> {
    let childProcess: cp.ChildProcessWithoutNullStreams;
    const cpOptions: cp.SpawnOptionsWithoutStdio = {
        detached: true,
        windowsHide: false,
        shell: true,
    };
    const traceCommand = 'dotnet-trace';
    const traceArgs = [
        'collect',
        '--providers',
        'Microsoft-Windows-DotNETRuntime',
        '--show-child-io',
        '--',
        `"${dotnetExecutablePath}"`,
    ];
    const allArgs = traceArgs.concat(argsWithPath);
    _channel.appendLine('Launching server with tracing');
    _channel.appendLine(`${traceCommand} ${allArgs.join(' ')}`);
    childProcess = cp.spawn(traceCommand, allArgs, cpOptions);
 }