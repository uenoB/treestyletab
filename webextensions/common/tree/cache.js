/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

async function getWindowSignature(aWindowIdOrTabs) {
  if (typeof aWindowIdOrTabs == 'number') {
    aWindowIdOrTabs = await browser.tabs.query({ windowId: aWindowIdOrTabs });
  }
  var uniqueIds = await getUniqueIds(aWindowIdOrTabs);
  return uniqueIds.join('\n');
}

async function getUniqueIds(aApiTabs) {
  var uniqueIds = await Promise.all(aApiTabs.map(aApiTab => browser.sessions.getTabValue(aApiTab.id, kPERSISTENT_ID)));
  return uniqueIds.map(aId => aId && aId.id || '?');
}

function trimSignature(aSignature, aIgnoreCount) {
  if (!aIgnoreCount || aIgnoreCount < 0)
    return aSignature;
  return aSignature.split('\n').slice(aIgnoreCount).join('\n');
}

function trimTabsCache(aCache, aIgnoreCount) {
  if (!aIgnoreCount || aIgnoreCount < 0)
    return aCache;
  return aCache.replace(new RegExp(`(<li[^>]*>.+?<\/li>){${aIgnoreCount}}`), '');
}

function matcheSignatures(aSignatures) {
  return (
    aSignatures.actual &&
    aSignatures.cached &&
    aSignatures.actual.indexOf(aSignatures.cached) + aSignatures.cached.length == aSignatures.actual.length
  );
}

function fixupTabsRestoredFromCache(aTabs, aApiTabs, aOptions = {}) {
  if (aTabs.length != aApiTabs.length)
    throw new Error(`fixupTabsRestoredFromCache: Mismatched number of tabs restored from cache, elements=${aTabs.length}, tabs.Tab=${aApiTabs.length}`);
  var idMap = {};
  aTabs.forEach((aTab, aIndex) => {
    var oldId = aTab.id;
    var apiTab = aApiTabs[aIndex];
    aTab.id = makeTabId(apiTab);
    aTab.setAttribute(kAPI_TAB_ID, apiTab.id || -1);
    aTab.setAttribute(kAPI_WINDOW_ID, apiTab.windowId || -1);
    idMap[oldId] = aTab.id;
  });
  aTabs.forEach((aTab, aIndex) => {
    fixupTabRestoredFromCache(aTab, aApiTabs[aIndex], {
      idMap: idMap,
      dirty: aOptions.dirty
    });
  });

  // update focused tab appearance
  browser.tabs.query({ windowId: aTabs[0].apiTab.windowId, active: true })
    .then(aActiveTabs => updateTabFocused(getTabById(aActiveTabs[0].id)));
}

function fixupTabRestoredFromCache(aTab, aApiTab, aOptions = {}) {
  aTab.apiTab = aApiTab;
  updateUniqueId(aTab);
  aTab.opened = Promise.resolve(true);
  aTab.closedWhileActive = new Promise((aResolve, aReject) => {
    aTab._resolveClosedWhileActive = aResolve;
  });

  var idMap = aOptions.idMap;

  aTab.childTabs = (aTab.getAttribute(kCHILDREN) || '')
    .split('|')
    .map(aOldId => getTabById(idMap[aOldId]))
    .filter(aTab => !!aTab);
  if (aTab.childTabs.length > 0)
    aTab.setAttribute(kCHILDREN, `|${aTab.childTabs.map(aTab => aTab.id).join('|')}|`);
  else
    aTab.removeAttribute(kCHILDREN);

  aTab.parentTab = getTabById(idMap[aTab.getAttribute(kPARENT)]);
  if (aTab.parentTab)
    aTab.setAttribute(kPARENT, aTab.parentTab.id);
  else
    aTab.removeAttribute(kPARENT);

  if (aOptions.dirty)
    updateTab(aTab, aTab.apiTab, { forceApply: true });
  else
    updateTabDebugTooltip(aTab);
}
