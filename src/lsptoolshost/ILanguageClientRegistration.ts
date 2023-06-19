/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RoslynLanguageClientInstance } from './roslynLanguageClient';
import { IDisposable } from '../Disposable';

export interface ILanguageClientRegistration {
    registerBeforeStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined;
    registerAfterStart(languageClient: RoslynLanguageClientInstance): IDisposable | undefined;
}