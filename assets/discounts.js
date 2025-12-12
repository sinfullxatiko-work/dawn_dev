

if (!customElements.get('discount-form')) {
  customElements.define(
    'discount-form',
    class Discounts extends HTMLElement {
      constructor() {
        super();

        this.discountFormElement = this.querySelector('form');
        this.discountInputElement = this.querySelector('input[type="text"]');
        this.errorElement = this.querySelector('.discount-form__error-message');
        this.cartButtonElement = this.querySelector('.discount-form__show-cart-button');
        this.removeButtonsNodeList = this.querySelectorAll('.discount__remove-button');

        this.onSubmitHandler = this.onSubmitHandler.bind(this);
        this.refreshCartCodes = this.refreshCartCodes.bind(this);
        this.getCurrentCodes = this.getCurrentCodes.bind(this);
        this.showCart = this.showCart.bind(this);
        this.removeDiscount = this.removeDiscount.bind(this);

        this.appliedCodes = [];
      }
      connectedCallback() {
        this.getCurrentCodes();
        if (this.discountFormElement)
          this.discountFormElement.addEventListener('submit', this.onSubmitHandler);
        if (this.cartButtonElement)
          this.cartButtonElement.addEventListener('click', this.showCart)
        if (this.removeButtonsNodeList.length > 0)
          this.removeButtonsNodeList.forEach(btn => { btn.addEventListener('click', this.removeDiscount) })
      }
      disconnectedCallback() {
        if (this.discountFormElement)
          this.discountFormElement.removeEventListener('submit', this.onSubmitHandler);
        if (this.removeButtonsNodeList.length)
          this.removeButtonsNodeList.forEach(btn => {
            btn.removeEventListener('click', this.removeDiscount)
          })
      }
      onSubmitHandler(event) {
        event.preventDefault();

        if (!this.discountInputElement) return;
        const inputText = this.discountInputElement.value;

        if (inputText === '') return;

        this.setFormDisabled(true);
        this.updateCart({ discount: inputText }, false)
          .then(cart => {
            const codeObj = cart.discount_codes[0];
            if (codeObj && codeObj.applicable) {
              if (!this.appliedCodes.includes(codeObj.code.toLowerCase())) {
                this.errorElement.textContent = '';
                this.appliedCodes.push(codeObj.code.toLowerCase());
                this.refreshCartCodes();
              } else {
                this.errorElement.textContent = "This code is already applied";
              }
            } else {
              this.errorElement.textContent = "Code does not exist";
            }
          })
          .catch((error) => {
            console.error('Error:', error);
          })
          .finally(() => this.setFormDisabled(false));
      }
      refreshCartCodes() {
        const discountsString = this.appliedCodes.join(',');
        return this.updateCart({ discount: discountsString })
          .then(data => {
            const discountList = data.discount_codes;
            const cantUsed = discountList.filter(discount => discount.applicable == false)[0];
            if (cantUsed) {
              this.appliedCodes = this.appliedCodes.filter(appliedCode => appliedCode != cantUsed.code);
              this.errorElement.textContent = cantUsed.code + " can't be applied, other stronger code from same category is already applied";
              console.log(cantUsed);
            }
          })
          .catch((error) => {
            console.error('Error:', error);
          });
      }
      updateCart(payload, shouldRender = true) {
        const sectionsToRender = shouldRender ? this.getSectionsToRender() : [];
        if (sectionsToRender.length) {
          payload.sections = sectionsToRender;
        }

        return fetch(window.Shopify.routes.root + 'cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((response) => response.json())
          .then((data) => {

            if (data.sections) {
              this.updateUIFromCartData(data);
            }
            return data;
          });
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
      setFormDisabled(isDisabled) {
        if (!this.discountFormElement) return;

        const controlsNodeList = this.discountFormElement.querySelectorAll('input, button');
        controlsNodeList.forEach(control => {
          control.disabled = isDisabled;
        })
      }
      removeDiscount(event) {
        const discount = event.target.closest('.discount');
        if (!discount) return;

        const discountCode = discount.querySelector('.discount__title').textContent.toLowerCase();
        this.appliedCodes = this.appliedCodes.filter(code => code != discountCode);

        discount.remove();
        this.isUpdatingCart = true;
        this.setFormDisabled(true);
        this.refreshCartCodes()
          .finally(() => this.setFormDisabled(false));

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
      updateUIFromCartData(cartData) {
        const sections = cartData.sections || {};

        if (Array.isArray(cartData.discount_codes)) {
          const applicableCodes = cartData.discount_codes.filter(code => code.applicable);
          this.appliedCodes = applicableCodes.map(code => code.code.toLowerCase());
        }

        const cartDrawerElement = document.querySelector('cart-drawer');
        if (
          cartDrawerElement &&
          typeof cartDrawerElement.renderContents === 'function' &&
          sections['cart-drawer']
        ) {
          cartDrawerElement.renderContents(cartData);
        }

        Object.keys(sections).forEach((sectionId) => {
          if (sectionId === 'cart-drawer' || sectionId === 'cart-icon-bubble') return;

          this.replaceSectionFromHtml(sectionId, sections[sectionId]);
        });
      }


      getSectionsToRender() {
        const sectionIds = [];

        const sectionId = this.discountFormElement?.dataset.section;
        const cartItemsSection = document.querySelector('cart-items')?.closest('.shopify-section');
        const cartItemsSectionId = cartItemsSection?.id;

        if (
          sectionId &&
          sectionId !== 'cart-drawer' &&
          sectionId !== 'cart-icon-bubble'
        ) {
          sectionIds.push(sectionId);
        }

        if (
          cartItemsSectionId &&
          cartItemsSectionId !== 'cart-drawer' &&
          cartItemsSectionId !== 'cart-icon-bubble'
        ) {
          // cart-items section
          sectionIds.push(cartItemsSectionId.replace('shopify-section-', ''));
        }

        const cartDrawerElement = document.querySelector('cart-drawer');
        if (cartDrawerElement) {
          sectionIds.push('cart-drawer', 'cart-icon-bubble');
        }

        return sectionIds;
      }

      replaceSectionFromHtml(sectionId, html) {
        if (!html) return;

        const currentSection = document.getElementById('shopify-section-' + sectionId);
        if (!currentSection) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newSection = doc.querySelector('#shopify-section-' + sectionId);
        if (!newSection) return;

        currentSection.replaceWith(newSection);

        const newInputElement =
          newSection.querySelector('discount-form input[type="text"]') ||
          newSection.querySelector('input[type="text"]');

        if (newInputElement) newInputElement.focus();
      }


    }
  )
}