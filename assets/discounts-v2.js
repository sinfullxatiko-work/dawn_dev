if (!customElements.get('discount-form')) {
  customElements.define(
    'discount-form',
    class DiscountsNew extends HTMLElement {
      constructor() {
        super();

        this.discountFormEl = this.querySelector('form');
        this.discountInputEl = this.querySelector('input[type="text"]');
        this.errorMessageEl = this.querySelector('.discount-form__error-message');
        this.cartButtonElement = this.querySelector('.discount-form__show-cart-button');
        this.removeButtonsNodeList = this.querySelectorAll('.discount__remove-button');

        this.onSubmitHandler = this.onSubmitHandler.bind(this);
        this.codeCheck = this.codeCheck.bind(this);
        this.updateUI = this.updateUI.bind(this);
        this.getSectionsToRender = this.getSectionsToRender.bind(this);
        this.showCart = this.showCart.bind(this);
        this.refreshCodes = this.refreshCodes.bind(this);
        this.getCurrentCodes = this.getCurrentCodes.bind(this);
        this.removeDiscount = this.removeDiscount.bind(this);
        this.setFormDisabled = this.setFormDisabled.bind(this);

        this.appliedCodes = [];
        this.stopRequest = false;
      }
      connectedCallback() {
        this.getCurrentCodes();

        if (this.discountFormEl)
          this.discountFormEl.addEventListener('submit', this.onSubmitHandler)
        if (this.cartButtonElement)
          this.cartButtonElement.addEventListener('click', this.showCart)
        if (this.removeButtonsNodeList.length > 0)
          this.removeButtonsNodeList.forEach(btn => { btn.addEventListener('click', this.removeDiscount) })
      }
      async onSubmitHandler(event) {
        event.preventDefault();
        this.stopRequest = false;
        if (!this.discountInputEl || this.discountInputEl.value === '') return;

        this.setFormDisabled(true);
        await this.codeCheck(this.discountInputEl.value)
        if (this.stopRequest) return;
        await this.refreshCodes(this.appliedCodes.join(','));
        if (this.stopRequest) return;
        await this.updateUI();

      }
      async removeDiscount(event) {
        const discount = event.target.closest('.discount');
        if (!discount) return;

        this.setFormDisabled(true);
        const discountCode = event.target.value;
        this.appliedCodes = this.appliedCodes.filter(code => code != discountCode);

        discount.remove();
        await this.refreshCodes(this.appliedCodes.join(','));
        await this.updateUI();
      }
      getCurrentCodes() {
        fetch(window.Shopify.routes.root + 'cart.js', {
          headers: {
            'Content-Type': 'application/json'
          },
        })
          .then(response => response.json())
          .then(data => {
            const codes = data.discount_codes;
            codes.forEach(code => {
              if (code.applicable) {
                this.appliedCodes.push(code.code.toLowerCase());
              }
            });
          })
      }
      showCart() {
        fetch(window.Shopify.routes.root + 'cart.js', {
          headers: {
            'Content-Type': 'application/json'
          },
        })
          .then(response => response.json())
          .then(data => { console.log(data) })
      }
      refreshCodes(payload) {
        return this.updateCart(payload)
          .then(cart => {
            const discountCodes = cart.discount_codes
            discountCodes.forEach(discount => {
              if (!discount.applicable) {
                if (this.appliedCodes[this.appliedCodes.length - 1].toLowerCase() == discount.code.toLowerCase()) {
                  this.stopRequest = true;
                  this.errorMessageEl.textContent = 'Better code is already applied';
                  this.setFormDisabled(false);
                }
                this.appliedCodes = this.appliedCodes.filter(code => code != discount.code.toLowerCase());
              }
            })
          })
      }
      codeCheck(payload) {
        return this.updateCart(payload)
          .then(cart => {
            const discountCode = cart.discount_codes[0];
            if (discountCode.applicable && !this.appliedCodes.includes(discountCode.code.toLowerCase()))
              this.appliedCodes.push(discountCode.code.toLowerCase());
            else {
              this.errorMessageEl.textContent = discountCode.applicable ? 'This code is already applied' : 'This code does not exist';
              this.stopRequest = true;
              this.setFormDisabled(false);
            }
          })
      }
      updateCart(data) {
        return fetch(window.Shopify.routes.root + 'cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discount: data })
        })
          .then(response => response.json())
      }
      updateUI() {
        const sectionIdList = this.getSectionsToRender();

        let sectionsString = 'cart?sections=' + sectionIdList.join(',');

        return this.renderSections(sectionsString, sectionIdList)
          .then(() => this.renderCartDrawer());
      }
      renderCartDrawer() {

        const cartDrawer = document.querySelector('cart-drawer');
        if (!cartDrawer) return Promise.resolve();

        if (typeof cartDrawer.renderContents !== 'function') return Promise.resolve();

        const drawerSections = typeof cartDrawer.getSectionsToRender === 'function'
          ? cartDrawer.getSectionsToRender()
          : [];

        const drawerSectionIds = (drawerSections || [])
          .map((s) => s && s.id)
          .filter(Boolean);

        if (drawerSectionIds.length === 0) {
          drawerSectionIds.push('cart-drawer', 'cart-icon-bubble');
          console.log('hello')
        }

        const path = window.Shopify.routes.root + 'cart?sections=' + drawerSectionIds.join(',');

        return fetch(path, { headers: { 'Content-Type': 'application/json' } })
          .then((r) => r.json())
          .then((sections) => {
            cartDrawer.renderContents({
              id: null,
              sections
            });
          })
          .finally(() => {
            const newDrawer = document.querySelector('cart-drawer.drawer');
            if (!newDrawer) return;
            const newInput = newDrawer.querySelector('.discount-form input[type="text"]');
            if (newInput) newInput.focus();
          })
      }


      renderSections(path, sectionIdList) {
        return fetch(window.Shopify.routes.root + path)
          .then(response => response.json())
          .then(data => {
            sectionIdList.forEach(sectionId => {
              const html = data[sectionId];
              if (!html) return;

              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');

              const newSection = doc.getElementById(`shopify-section-${sectionId}`);
              const currentSection = document.getElementById(`shopify-section-${sectionId}`);

              if (currentSection && newSection) {
                currentSection.replaceWith(newSection);
              }
              const input = newSection?.querySelector('input[type="text"]');
              if (input) input.focus();
            });
          })
      }
      getSectionsToRender() {
        const sectionsIdList = [];
        const currentSectionId = this.discountFormEl.dataset.section;
        const cartItemsSection = document.querySelector('cart-items')?.closest('.shopify-section');
        if (!cartItemsSection) return sectionsIdList;

        const cartItemsSectionId = cartItemsSection.id;
        if (this.isNotCartDrawer(currentSectionId))
          sectionsIdList.push(currentSectionId);
        if (cartItemsSectionId && this.isNotCartDrawer(cartItemsSectionId))
          sectionsIdList.push(cartItemsSectionId.replace('shopify-section-', ''));

        return sectionsIdList;
      }
      isNotCartDrawer(sectionId) {
        return sectionId && sectionId != 'cart-drawer' && sectionId != 'cart-icon-bubble';
      }
      setFormDisabled(isDisable) {
        if (!this.discountFormEl) return;
        const formElementList = this.discountFormEl.querySelectorAll('input, button');

        formElementList.forEach(element => element.disabled = isDisable);
      }
    }
  )
}