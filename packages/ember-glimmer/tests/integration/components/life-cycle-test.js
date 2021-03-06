import { set, setProperties, run } from 'ember-metal';
import { Component } from '../../utils/helpers';
import { strip } from '../../utils/abstract-test-case';
import { moduleFor, RenderingTest } from '../../utils/test-case';
import { getViewId } from 'ember-views';

class LifeCycleHooksTest extends RenderingTest {
  constructor() {
    super();
    this.hooks = [];
    this.components = {};
    this.componentRegistry = [];
    this.teardownAssertions = [];
  }

  teardown() {
    super.teardown();

    for (let i = 0; i < this.teardownAssertions.length; i++) {
      this.teardownAssertions[i]();
    }
  }

  /* abstract */
  get ComponentClass() {
    throw new Error('Not implemented: `ComponentClass`');
  }

  /* abstract */
  invocationFor(name, namedArgs = {}) {
    throw new Error('Not implemented: `invocationFor`');
  }

  /* abstract */
  attrFor(name) {
    throw new Error('Not implemented: `attrFor`');
  }

  get boundHelpers() {
    return {
      invoke: bind(this.invocationFor, this),
      attr:   bind(this.attrFor, this)
    };
  }

  assertRegisteredViews(label) {
    let viewRegistry = this.owner.lookup('-view-registry:main');
    let topLevelId = getViewId(this.component);
    let actual = Object.keys(viewRegistry).sort().filter(id => id !== topLevelId);
    let expected = this.componentRegistry.sort();

    this.assert.deepEqual(actual, expected, 'registered views - ' + label);
  }

  registerComponent(name, { template = null }) {
    let pushComponent = (instance) => {
      this.components[name] = instance;
      this.componentRegistry.push(getViewId(instance));
    };

    let removeComponent = (instance) => {
      let index = this.componentRegistry.indexOf(instance);
      this.componentRegistry.splice(index, 1);

      delete this.components[name];
    };

    let pushHook = (hookName, args) => {
      this.hooks.push(hook(name, hookName, args));
    };

    let assertParentView = (hookName, instance) => {
      this.assert.ok(instance.parentView, `parentView should be present in ${hookName}`);

      if (hookName === 'willDestroyElement') {
        this.assert.ok(instance.parentView.childViews.indexOf(instance) !== -1, `view is still connected to parentView in ${hookName}`);
      }
    };

    let assertElement = (hookName, instance) => {
      if (instance.tagName === '') { return; }

      this.assert.ok(instance.element, `element property should be present on ${instance} during ${hookName}`);
      this.assert.ok(document.body.contains(instance.element), `element for ${instance} should be in the DOM during ${hookName}`);
    };

    let assertNoElement = (hookName, instance) => {
      if (instance.element) {
        this.assert.ok(false, `element should not be present in ${hookName}`);
      }
    };

    let ComponentClass = this.ComponentClass.extend({
      init() {
        expectDeprecation(() => { this._super(...arguments); },
          /didInitAttrs called/);

        this.componentName = name;
        pushHook('init');
        pushComponent(this);
        assertParentView('init', this);
        assertNoElement('init', this);
      },

      didInitAttrs(options) {
        pushHook('didInitAttrs', options);
        assertParentView('didInitAttrs', this);
        assertNoElement('didInitAttrs', this);
      },

      didUpdateAttrs(options) {
        pushHook('didUpdateAttrs', options);
        assertParentView('didUpdateAttrs', this);
      },

      willUpdate(options) {
        pushHook('willUpdate', options);
        assertParentView('willUpdate', this);
      },

      didReceiveAttrs(options) {
        pushHook('didReceiveAttrs', options);
        assertParentView('didReceiveAttrs', this);
      },

      willRender() {
        pushHook('willRender');
        assertParentView('willRender', this);
      },

      didRender() {
        pushHook('didRender');
        assertParentView('didRender', this);
        assertElement('didRender', this);
      },

      didInsertElement() {
        pushHook('didInsertElement');
        assertParentView('didInsertElement', this);
        assertElement('didInsertElement', this);
      },

      didUpdate(options) {
        pushHook('didUpdate', options);
        assertParentView('didUpdate', this);
        assertElement('didUpdate', this);
      },

      willDestroyElement() {
        pushHook('willDestroyElement');
        assertParentView('willDestroyElement', this);
        assertElement('willDestroyElement', this);
      },

      willClearRender() {
        pushHook('willClearRender');
        assertParentView('willClearRender', this);
        assertElement('willClearRender', this);
      },

      didDestroyElement() {
        pushHook('didDestroyElement');
        assertNoElement('didDestroyElement', this);
      },

      willDestroy() {
        pushHook('willDestroy');
        removeComponent(this);

        this._super(...arguments);
      }
    });

    super.registerComponent(name, { ComponentClass, template });
  }

  assertHooks(label, ...rawHooks) {
    let hooks = rawHooks.map(raw => hook(...raw));
    this.assert.deepEqual(json(this.hooks), json(hooks), label);
    this.hooks = [];
  }

  ['@test lifecycle hooks are invoked in a predictable order']() {
    let { attr, invoke } = this.boundHelpers;

    this.registerComponent('the-top', { template: strip`
      <div>
        Twitter: {{${attr('twitter')}}}|
        ${invoke('the-middle', { name: string('Tom Dale') })}
      </div>`
    });

    this.registerComponent('the-middle', { template: strip`
      <div>
        Name: {{${attr('name')}}}|
        ${invoke('the-bottom', { website: string('tomdale.net') })}
      </div>`
    });

    this.registerComponent('the-bottom', { template: strip`
      <div>
        Website: {{${attr('website')}}}
      </div>`
    });

    this.render(invoke('the-top', { twitter: expr('twitter') }), { twitter: '@tomdale' });

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');
    this.assertRegisteredViews('intial render');

    let topAttrs = { twitter: '@tomdale' };
    let middleAttrs = { name: 'Tom Dale' };
    let bottomAttrs = { website: 'tomdale.net' };

    this.assertHooks(

      'after initial render',

      // Sync hooks

      ['the-top', 'init'],
      ['the-top', 'didInitAttrs',       { attrs: topAttrs }],
      ['the-top', 'didReceiveAttrs',    { newAttrs: topAttrs }],
      ['the-top', 'willRender'],

      ['the-middle', 'init'],
      ['the-middle', 'didInitAttrs',    { attrs: middleAttrs }],
      ['the-middle', 'didReceiveAttrs', { newAttrs: middleAttrs }],
      ['the-middle', 'willRender'],

      ['the-bottom', 'init'],
      ['the-bottom', 'didInitAttrs',    { attrs: bottomAttrs }],
      ['the-bottom', 'didReceiveAttrs', { newAttrs: bottomAttrs }],
      ['the-bottom', 'willRender'],

      // Async hooks

      ['the-bottom', 'didInsertElement'],
      ['the-bottom', 'didRender'],

      ['the-middle', 'didInsertElement'],
      ['the-middle', 'didRender'],

      ['the-top', 'didInsertElement'],
      ['the-top', 'didRender']

    );

    this.runTask(() => this.components['the-bottom'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(

      'after no-op rerender (bottom)',

      // Sync hooks

      ['the-top', 'willUpdate'],
      ['the-top', 'willRender'],

      ['the-middle', 'willUpdate'],
      ['the-middle', 'willRender'],

      ['the-bottom', 'willUpdate'],
      ['the-bottom', 'willRender'],

      // Async hooks

      ['the-bottom', 'didUpdate'],
      ['the-bottom', 'didRender'],

      ['the-middle', 'didUpdate'],
      ['the-middle', 'didRender'],

      ['the-top', 'didUpdate'],
      ['the-top', 'didRender']

    );

    this.runTask(() => this.components['the-middle'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(
      'after no-op rerender (middle)',

      // Sync hooks

      ['the-top', 'willUpdate'],
      ['the-top', 'willRender'],

      ['the-middle', 'willUpdate'],
      ['the-middle', 'willRender'],

      // Async hooks

      ['the-middle', 'didUpdate'],
      ['the-middle', 'didRender'],

      ['the-top', 'didUpdate'],
      ['the-top', 'didRender']

    );

    this.runTask(() => this.components['the-top'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(
      'after no-op rerender (top)',

      // Sync hooks

      ['the-top', 'willUpdate'],
      ['the-top', 'willRender'],

      // Async hooks

      ['the-top', 'didUpdate'],
      ['the-top', 'didRender']
    );

    this.runTask(() => set(this.context, 'twitter', '@horsetomdale'));

    this.assertText('Twitter: @horsetomdale|Name: Tom Dale|Website: tomdale.net');

    // Because the `twitter` attr is only used by the topmost component,
    // and not passed down, we do not expect to see lifecycle hooks
    // called for child components. If the `didReceiveAttrs` hook used
    // the new attribute to rerender itself imperatively, that would result
    // in lifecycle hooks being invoked for the child.

    topAttrs = { oldAttrs: { twitter: '@tomdale' }, newAttrs: { twitter: '@horsetomdale' } };

    this.assertHooks(

      'after update',

      // Sync hooks

      ['the-top', 'didUpdateAttrs', topAttrs],
      ['the-top', 'didReceiveAttrs', topAttrs],

      ['the-top', 'willUpdate'],
      ['the-top', 'willRender'],

      // Async hooks

      ['the-top', 'didUpdate'],
      ['the-top', 'didRender']

    );

    this.teardownAssertions.push(() => {
      this.assertHooks(
        'destroy',
        ['the-top', 'willDestroyElement'],
        ['the-top', 'willClearRender'],
        ['the-middle', 'willDestroyElement'],
        ['the-middle', 'willClearRender'],
        ['the-bottom', 'willDestroyElement'],
        ['the-bottom', 'willClearRender'],
        ['the-top', 'didDestroyElement'],
        ['the-middle', 'didDestroyElement'],
        ['the-bottom', 'didDestroyElement'],
        ['the-top', 'willDestroy'],
        ['the-middle', 'willDestroy'],
        ['the-bottom', 'willDestroy']
      );

      this.assertRegisteredViews('after destroy');
    });
  }

  ['@test lifecycle hooks are invoked in a correct sibling order']() {
    let { attr, invoke } = this.boundHelpers;

    this.registerComponent('the-parent', { template: strip`
      <div>
        ${invoke('the-first-child', { twitter: expr(attr('twitter')) })}|
        ${invoke('the-second-child', { name: expr(attr('name')) })}|
        ${invoke('the-last-child', { website: expr(attr('website')) })}
      </div>`
    });

    this.registerComponent('the-first-child', { template: `Twitter: {{${attr('twitter')}}}` });

    this.registerComponent('the-second-child', { template: `Name: {{${attr('name')}}}` });

    this.registerComponent('the-last-child', { template: `Website: {{${attr('website')}}}` });

    this.render(invoke('the-parent', {
      twitter: expr('twitter'),
      name: expr('name'),
      website: expr('website')
    }), {
      twitter: '@tomdale',
      name: 'Tom Dale',
      website: 'tomdale.net'
    });

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');
    this.assertRegisteredViews('intial render');

    let parentAttrs = { twitter: '@tomdale', name: 'Tom Dale', website: 'tomdale.net' };
    let firstAttrs  = { twitter: '@tomdale' };
    let secondAttrs = { name: 'Tom Dale' };
    let lastAttrs = { website: 'tomdale.net' };

    this.assertHooks(

      'after initial render',

      // Sync hooks

      ['the-parent', 'init'],
      ['the-parent', 'didInitAttrs',          { attrs: parentAttrs }],
      ['the-parent', 'didReceiveAttrs',       { newAttrs: parentAttrs }],
      ['the-parent', 'willRender'],

      ['the-first-child', 'init'],
      ['the-first-child', 'didInitAttrs',     { attrs: firstAttrs }],
      ['the-first-child', 'didReceiveAttrs',  { newAttrs: firstAttrs }],
      ['the-first-child', 'willRender'],

      ['the-second-child', 'init'],
      ['the-second-child', 'didInitAttrs',    { attrs: secondAttrs }],
      ['the-second-child', 'didReceiveAttrs', { newAttrs: secondAttrs }],
      ['the-second-child', 'willRender'],

      ['the-last-child', 'init'],
      ['the-last-child', 'didInitAttrs',      { attrs: lastAttrs }],
      ['the-last-child', 'didReceiveAttrs',   { newAttrs: lastAttrs }],
      ['the-last-child', 'willRender'],

      // Async hooks

      ['the-first-child', 'didInsertElement'],
      ['the-first-child', 'didRender'],

      ['the-second-child', 'didInsertElement'],
      ['the-second-child', 'didRender'],

      ['the-last-child', 'didInsertElement'],
      ['the-last-child', 'didRender'],

      ['the-parent', 'didInsertElement'],
      ['the-parent', 'didRender']

    );

    this.runTask(() => this.components['the-first-child'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(

      'after no-op rerender (first child)',

      // Sync hooks

      ['the-parent', 'willUpdate'],
      ['the-parent', 'willRender'],

      ['the-first-child', 'willUpdate'],
      ['the-first-child', 'willRender'],

      // Async hooks

      ['the-first-child', 'didUpdate'],
      ['the-first-child', 'didRender'],

      ['the-parent', 'didUpdate'],
      ['the-parent', 'didRender']

    );

    this.runTask(() => this.components['the-second-child'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(

      'after no-op rerender (second child)',

      // Sync hooks

      ['the-parent', 'willUpdate'],
      ['the-parent', 'willRender'],

      ['the-second-child', 'willUpdate'],
      ['the-second-child', 'willRender'],

      // Async hooks

      ['the-second-child', 'didUpdate'],
      ['the-second-child', 'didRender'],

      ['the-parent', 'didUpdate'],
      ['the-parent', 'didRender']

    );

    this.runTask(() => this.components['the-last-child'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(

      'after no-op rerender (last child)',

      // Sync hooks

      ['the-parent', 'willUpdate'],
      ['the-parent', 'willRender'],

      ['the-last-child', 'willUpdate'],
      ['the-last-child', 'willRender'],

      // Async hooks

      ['the-last-child', 'didUpdate'],
      ['the-last-child', 'didRender'],

      ['the-parent', 'didUpdate'],
      ['the-parent', 'didRender']

    );

    this.runTask(() => this.components['the-parent'].rerender());

    this.assertText('Twitter: @tomdale|Name: Tom Dale|Website: tomdale.net');

    this.assertHooks(

      'after no-op rerender (parent)',

      // Sync hooks

      ['the-parent', 'willUpdate'],
      ['the-parent', 'willRender'],

      // Async hooks

      ['the-parent', 'didUpdate'],
      ['the-parent', 'didRender']

    );

    this.runTask(() => setProperties(this.context, {
      twitter: '@horsetomdale',
      name: 'Horse Tom Dale',
      website: 'horsetomdale.net'
    }));

    this.assertText('Twitter: @horsetomdale|Name: Horse Tom Dale|Website: horsetomdale.net');

    parentAttrs = {
      oldAttrs: { twitter: '@tomdale', name: 'Tom Dale', website: 'tomdale.net' },
      newAttrs: { twitter: '@horsetomdale', name: 'Horse Tom Dale', website: 'horsetomdale.net' }
    };
    firstAttrs  = { oldAttrs: { twitter: '@tomdale' }, newAttrs: { twitter: '@horsetomdale' } };
    secondAttrs = { oldAttrs: { name: 'Tom Dale' }, newAttrs: { name: 'Horse Tom Dale' } };
    lastAttrs = { oldAttrs: { website: 'tomdale.net' }, newAttrs: { website: 'horsetomdale.net' } };

    this.assertHooks(

      'after update',

      // Sync hooks

      ['the-parent', 'didUpdateAttrs', parentAttrs],
      ['the-parent', 'didReceiveAttrs', parentAttrs],

      ['the-parent', 'willUpdate'],
      ['the-parent', 'willRender'],

      ['the-first-child', 'didUpdateAttrs', firstAttrs],
      ['the-first-child', 'didReceiveAttrs', firstAttrs],

      ['the-first-child', 'willUpdate'],
      ['the-first-child', 'willRender'],

      ['the-second-child', 'didUpdateAttrs', secondAttrs],
      ['the-second-child', 'didReceiveAttrs', secondAttrs],

      ['the-second-child', 'willUpdate'],
      ['the-second-child', 'willRender'],

      ['the-last-child', 'didUpdateAttrs', lastAttrs],
      ['the-last-child', 'didReceiveAttrs', lastAttrs],

      ['the-last-child', 'willUpdate'],
      ['the-last-child', 'willRender'],

      // Async hooks

      ['the-first-child', 'didUpdate'],
      ['the-first-child', 'didRender'],

      ['the-second-child', 'didUpdate'],
      ['the-second-child', 'didRender'],

      ['the-last-child', 'didUpdate'],
      ['the-last-child', 'didRender'],

      ['the-parent', 'didUpdate'],
      ['the-parent', 'didRender']

    );

    this.teardownAssertions.push(() => {
      this.assertHooks(
        'destroy',
        ['the-parent', 'willDestroyElement'],
        ['the-parent', 'willClearRender'],
        ['the-first-child', 'willDestroyElement'],
        ['the-first-child', 'willClearRender'],
        ['the-second-child', 'willDestroyElement'],
        ['the-second-child', 'willClearRender'],
        ['the-last-child', 'willDestroyElement'],
        ['the-last-child', 'willClearRender'],

        ['the-parent', 'didDestroyElement'],
        ['the-first-child', 'didDestroyElement'],
        ['the-second-child', 'didDestroyElement'],
        ['the-last-child', 'didDestroyElement'],

        ['the-parent', 'willDestroy'],
        ['the-first-child', 'willDestroy'],
        ['the-second-child', 'willDestroy'],
        ['the-last-child', 'willDestroy']
      );

      this.assertRegisteredViews('after destroy');
    });
  }

  ['@test passing values through attrs causes lifecycle hooks to fire if the attribute values have changed']() {
    let { attr, invoke } = this.boundHelpers;

    this.registerComponent('the-top', { template: strip`
      <div>
        Top: ${invoke('the-middle', { twitterTop: expr(attr('twitter')) })}
      </div>`
    });

    this.registerComponent('the-middle', { template: strip`
      <div>
        Middle: ${invoke('the-bottom', { twitterMiddle: expr(attr('twitterTop')) })}
      </div>`
    });

    this.registerComponent('the-bottom', { template: strip`
      <div>
        Bottom: {{${attr('twitterMiddle')}}}
      </div>`
    });

    this.render(invoke('the-top', { twitter: expr('twitter') }), { twitter: '@tomdale' });

    this.assertText('Top: Middle: Bottom: @tomdale');
    this.assertRegisteredViews('intial render');

    let topAttrs = { twitter: '@tomdale' };
    let middleAttrs = { twitterTop: '@tomdale' };
    let bottomAttrs = { twitterMiddle: '@tomdale' };

    this.assertHooks(

      'after initial render',

      // Sync hooks

      ['the-top', 'init'],
      ['the-top', 'didInitAttrs',       { attrs: topAttrs }],
      ['the-top', 'didReceiveAttrs',    { newAttrs: topAttrs }],
      ['the-top', 'willRender'],

      ['the-middle', 'init'],
      ['the-middle', 'didInitAttrs',    { attrs: middleAttrs }],
      ['the-middle', 'didReceiveAttrs', { newAttrs: middleAttrs }],
      ['the-middle', 'willRender'],

      ['the-bottom', 'init'],
      ['the-bottom', 'didInitAttrs',    { attrs: bottomAttrs }],
      ['the-bottom', 'didReceiveAttrs', { newAttrs: bottomAttrs }],
      ['the-bottom', 'willRender'],

      // Async hooks

      ['the-bottom', 'didInsertElement'],
      ['the-bottom', 'didRender'],

      ['the-middle', 'didInsertElement'],
      ['the-middle', 'didRender'],

      ['the-top', 'didInsertElement'],
      ['the-top', 'didRender']

    );

    this.runTask(() => set(this.context, 'twitter', '@horsetomdale'));

    this.assertText('Top: Middle: Bottom: @horsetomdale');

    // Because the `twitter` attr is used by the all of the components,
    // the lifecycle hooks are invoked for all components.

    topAttrs = { oldAttrs: { twitter: '@tomdale' }, newAttrs: { twitter: '@horsetomdale' } };
    middleAttrs = { oldAttrs: { twitterTop: '@tomdale' }, newAttrs: { twitterTop: '@horsetomdale' } };
    bottomAttrs = { oldAttrs: { twitterMiddle: '@tomdale' }, newAttrs: { twitterMiddle: '@horsetomdale' } };

    this.assertHooks(

      'after updating (root)',

      // Sync hooks

      ['the-top', 'didUpdateAttrs', topAttrs],
      ['the-top', 'didReceiveAttrs', topAttrs],

      ['the-top', 'willUpdate'],
      ['the-top', 'willRender'],

      ['the-middle', 'didUpdateAttrs', middleAttrs],
      ['the-middle', 'didReceiveAttrs', middleAttrs],

      ['the-middle', 'willUpdate'],
      ['the-middle', 'willRender'],

      ['the-bottom', 'didUpdateAttrs', bottomAttrs],
      ['the-bottom', 'didReceiveAttrs', bottomAttrs],

      ['the-bottom', 'willUpdate'],
      ['the-bottom', 'willRender'],

      // Async hooks

      ['the-bottom', 'didUpdate'],
      ['the-bottom', 'didRender'],

      ['the-middle', 'didUpdate'],
      ['the-middle', 'didRender'],

      ['the-top', 'didUpdate'],
      ['the-top', 'didRender']

    );

    this.runTask(() => this.rerender());

    this.assertText('Top: Middle: Bottom: @horsetomdale');

    // In this case, because the attrs are passed down, all child components are invoked.

    topAttrs = { oldAttrs: { twitter: '@horsetomdale' }, newAttrs: { twitter: '@horsetomdale' } };
    middleAttrs = { oldAttrs: { twitterTop: '@horsetomdale' }, newAttrs: { twitterTop: '@horsetomdale' } };
    bottomAttrs = { oldAttrs: { twitterMiddle: '@horsetomdale' }, newAttrs: { twitterMiddle: '@horsetomdale' } };

    this.assertHooks('after no-op rernder (root)');

    this.teardownAssertions.push(() => {
      this.assertHooks(
        'destroy',
        ['the-top', 'willDestroyElement'],
        ['the-top', 'willClearRender'],
        ['the-middle', 'willDestroyElement'],
        ['the-middle', 'willClearRender'],
        ['the-bottom', 'willDestroyElement'],
        ['the-bottom', 'willClearRender'],
        ['the-top', 'didDestroyElement'],
        ['the-middle', 'didDestroyElement'],
        ['the-bottom', 'didDestroyElement'],
        ['the-top', 'willDestroy'],
        ['the-middle', 'willDestroy'],
        ['the-bottom', 'willDestroy']
      );

      this.assertRegisteredViews('after destroy');
    });
  }

  ['@test components rendered from `{{each}}` have correct life-cycle hooks to be called']() {
    let { invoke } = this.boundHelpers;

    this.registerComponent('nested-item', { template: `{{yield}}` });

    this.registerComponent('an-item', { template: strip`
      {{#nested-item}}Item: {{count}}{{/nested-item}}
    ` });

    this.registerComponent('no-items', { template: strip`
      {{#nested-item}}Nothing to see here{{/nested-item}}
    ` });

    this.render(strip`
      {{#each items as |item|}}
        ${invoke('an-item', { count: expr('item') })}
      {{else}}
        ${invoke('no-items')}
      {{/each}}
    `, {
      items: [1, 2, 3, 4, 5]
    });

    this.assertText('Item: 1Item: 2Item: 3Item: 4Item: 5');
    this.assertRegisteredViews('intial render');

    let initialHooks = (count) => {
      return [
        ['an-item', 'init'],
        ['an-item', 'didInitAttrs',       { attrs: { count } }],
        ['an-item', 'didReceiveAttrs',    { newAttrs: { count } }],
        ['an-item', 'willRender'],
        ['nested-item', 'init'],
        ['nested-item', 'didInitAttrs',       { attrs: { } }],
        ['nested-item', 'didReceiveAttrs',    { newAttrs: { } }],
        ['nested-item', 'willRender']
      ];
    };

    let initialAfterRenderHooks = (count) => {
      return [
        ['nested-item', 'didInsertElement'],
        ['nested-item', 'didRender'],
        ['an-item', 'didInsertElement'],
        ['an-item', 'didRender']
      ];
    };

    this.assertHooks(

      'after initial render',

      // Sync hooks
        ...initialHooks(1),
        ...initialHooks(2),
        ...initialHooks(3),
        ...initialHooks(4),
        ...initialHooks(5),

      // Async hooks
        ...initialAfterRenderHooks(5),
        ...initialAfterRenderHooks(4),
        ...initialAfterRenderHooks(3),
        ...initialAfterRenderHooks(2),
        ...initialAfterRenderHooks(1)
    );

    this.assert.equal(this.component.childViews.length, 5, 'childViews precond');

    this.runTask(() => set(this.context, 'items', []));

    this.assert.equal(this.component.childViews.length, 1, 'childViews updated');

    this.assertText('Nothing to see here');

    this.assertHooks(
      'reset to empty array',

      ['an-item', 'willDestroyElement'],
      ['an-item', 'willClearRender'],
      ['nested-item', 'willDestroyElement'],
      ['nested-item', 'willClearRender'],
      ['an-item', 'willDestroyElement'],
      ['an-item', 'willClearRender'],
      ['nested-item', 'willDestroyElement'],
      ['nested-item', 'willClearRender'],
      ['an-item', 'willDestroyElement'],
      ['an-item', 'willClearRender'],
      ['nested-item', 'willDestroyElement'],
      ['nested-item', 'willClearRender'],
      ['an-item', 'willDestroyElement'],
      ['an-item', 'willClearRender'],
      ['nested-item', 'willDestroyElement'],
      ['nested-item', 'willClearRender'],
      ['an-item', 'willDestroyElement'],
      ['an-item', 'willClearRender'],
      ['nested-item', 'willDestroyElement'],
      ['nested-item', 'willClearRender'],

      ['no-items', 'init'],
      ['no-items', 'didInitAttrs',       { attrs: { } }],
      ['no-items', 'didReceiveAttrs',    { newAttrs: { } }],
      ['no-items', 'willRender'],


      ['nested-item', 'init'],
      ['nested-item', 'didInitAttrs',       { attrs: { } }],
      ['nested-item', 'didReceiveAttrs',    { newAttrs: { } }],
      ['nested-item', 'willRender'],

      ['an-item', 'didDestroyElement'],
      ['nested-item', 'didDestroyElement'],
      ['an-item', 'didDestroyElement'],
      ['nested-item', 'didDestroyElement'],
      ['an-item', 'didDestroyElement'],
      ['nested-item', 'didDestroyElement'],
      ['an-item', 'didDestroyElement'],
      ['nested-item', 'didDestroyElement'],
      ['an-item', 'didDestroyElement'],
      ['nested-item', 'didDestroyElement'],

      ['nested-item', 'didInsertElement'],
      ['nested-item', 'didRender'],
      ['no-items', 'didInsertElement'],
      ['no-items', 'didRender'],

      ['an-item', 'willDestroy'],
      ['nested-item', 'willDestroy'],
      ['an-item', 'willDestroy'],
      ['nested-item', 'willDestroy'],
      ['an-item', 'willDestroy'],
      ['nested-item', 'willDestroy'],
      ['an-item', 'willDestroy'],
      ['nested-item', 'willDestroy'],
      ['an-item', 'willDestroy'],
      ['nested-item', 'willDestroy']
    );

    this.teardownAssertions.push(() => {
      this.assertHooks(
        'destroy',

        ['no-items', 'willDestroyElement'],
        ['no-items', 'willClearRender'],
        ['nested-item', 'willDestroyElement'],
        ['nested-item', 'willClearRender'],

        ['no-items', 'didDestroyElement'],
        ['nested-item', 'didDestroyElement'],

        ['no-items', 'willDestroy'],
        ['nested-item', 'willDestroy']
      );

      this.assertRegisteredViews('after destroy');
    });
  }
}

moduleFor('Components test: lifecycle hooks (curly components)', class extends LifeCycleHooksTest {

  get ComponentClass() {
    return Component;
  }

  invocationFor(name, namedArgs = {}) {
    let attrs = Object.keys(namedArgs).map(k => `${k}=${this.val(namedArgs[k])}`).join(' ');
    return `{{${name} ${attrs}}}`;
  }

  attrFor(name) {
    return `${name}`;
  }

  /* private */
  val(value) {
    if (value.isString) {
      return JSON.stringify(value.value);
    } else if (value.isExpr) {
      return `(readonly ${value.value})`;
    } else {
      throw new Error(`Unknown value: ${value}`);
    }
  }

});

moduleFor('Run loop and lifecycle hooks', class extends RenderingTest {
  ['@test afterRender set']() {
    let ComponentClass = Component.extend({
      width: '5',
      didInsertElement() {
        run.scheduleOnce('afterRender', () => {
          this.set('width', '10');
        });
      }
    });

    let template = `{{width}}`;
    this.registerComponent('foo-bar', { ComponentClass, template });

    this.render('{{foo-bar}}');

    this.assertText('10');

    this.runTask(() => this.rerender());

    this.assertText('10');
  }

  ['@test afterRender set on parent']() {
    let ComponentClass = Component.extend({
      didInsertElement() {
        run.scheduleOnce('afterRender', () => {
          let parent = this.get('parent');
          parent.set('foo', 'wat');
        });
      }
    });

    let template = `{{foo}}`;

    this.registerComponent('foo-bar', { ComponentClass, template });

    this.render('{{foo-bar parent=this foo=foo}}');

    this.assertText('wat');

    this.runTask(() => this.rerender());

    this.assertText('wat');
  }
});

function bind(func, thisArg) {
  return (...args) => func.apply(thisArg, args);
}

function string(value) {
  return { isString: true, value };
}

function expr(value) {
  return { isExpr: true, value };
}

function hook(name, hook, args) {
  return { name, hook, args };
}

function json(serializable) {
  return JSON.parse(JSON.stringify(serializable));
}
