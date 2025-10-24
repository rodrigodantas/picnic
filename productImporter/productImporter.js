import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getProducts from '@salesforce/apex/ProductService.getProducts';
import getProductDetails from '@salesforce/apex/ProductService.getProductDetails';
import importProducts from '@salesforce/apex/ProductService.importProducts';

export default class ProductImporter extends LightningElement {
    @track allProducts; // Full, original list of products
    @track filteredProducts; // List displayed after filtering
    @track searchTerm = '';
    @track selectedProductIds = new Set();
    
    @track isLoading = false;
    @track error;

    // Detail Modal (Requirement 6)
    @track showDetailModal = false;
    @track currentProduct = {}; // Clicked product data (name, price, image)
    @track currentProductDetails = {}; // Details (description)

    // @wire to load products on initialization (Requirement 2)
    @wire(getProducts)
    wiredProducts({ error, data }) {
        this.isLoading = true;
        if (data) {
            // Initialize the product list. Add 'isSelected' for UI control.
            this.allProducts = data.map(product => ({
                ...product,
                isSelected: false // Add control property
            }));
            this.filteredProducts = this.allProducts;
            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : 'Unknown error';
            this.allProducts = undefined;
            this.filteredProducts = undefined;
            this.showToast('Error', this.error, 'error');
        }
        this.isLoading = false;
    }

    get unifiedDescription() {
        if (this.currentProductDetails) {
            // 1. Try the right field (description)
            if (this.currentProductDetails.description) {
                return this.currentProductDetails.description;
            }
            // 2.try the wrong field (decription)
            if (this.currentProductDetails.decription) {
                return this.currentProductDetails.decription;
            }
        }
        return ''; // fallback message
    }

    // Getter to disable the Import button
    get isImportDisabled() {
        return this.selectedProductIds.size === 0;
    }

    get showNoProductsFound() {
    // Retorn TRUE if the filtered list is false/empty and NOT is loading
        return !this.isLoading && (!this.filteredProducts || this.filteredProducts.length === 0);
    }

    /**
     * Requirement 3: Dynamic Filter Logic.
     * Executes filtering when 3 or more characters are typed.
     */
    handleFilterChange(event) {
        this.searchTerm = event.target.value.toLowerCase();
        
        if (this.searchTerm.length >= 3) {
            // Match on substrings of product names
            this.filteredProducts = this.allProducts.filter(product => 
                product.name.toLowerCase().includes(this.searchTerm)
            );
        } else {
            // If less than 3 characters, display the full list.
            this.filteredProducts = this.allProducts;
        }
    }

    /**
     * Requirement 4: Checkbox Control.
     * Manages which products are selected for import.
     */
    handleCheckboxChange(event) {
        const productId = event.target.dataset.id;
        const isChecked = event.target.checked;

        // Update the Set of selected IDs
        if (isChecked) {
            this.selectedProductIds.add(productId);
        } else {
            this.selectedProductIds.delete(productId);
        }
        
        // Update the 'isSelected' property in the list for checkbox rendering.
        this.allProducts = this.allProducts.map(product => {
            if (product.product_Id === productId) {
                return { ...product, isSelected: isChecked };
            }
            return product;
        });

        // Re-apply filter so 'filteredProducts' is updated
        this.handleFilterChange({ target: { value: this.searchTerm || '' } });
    }

    /**
     * Prevents the checkbox click from propagating to the product container (to avoid opening the modal).
     */
    stopPropagation(event) {
        event.stopPropagation();
    }

    /**
     * Requirement 5: Import Logic.
     * Sends selected products to Apex for Product2 creation.
     */
    handleImport() {
        this.isLoading = true;
                
        // Map selected IDs back to the complete product objects
        const productsToImport = this.allProducts.filter(product => 
            this.selectedProductIds.has(product.product_id)
        );

        console.log('productsToImport:', JSON.stringify(productsToImport, null, 2));

        const MAX_ID_LENGTH = 13;
        let validationFailed = false;
        let invalidProducts = [];

        // Validate products before sending to Apex
        for (const product of productsToImport) {
            if (product.product_id && product.product_id.length > MAX_ID_LENGTH) {
                validationFailed = true;
                invalidProducts.push(product.name);
            }
        }

        if (validationFailed) {
            this.isLoading = false;
            const message = `The following products have External IDs exceeding the maximum length of ${MAX_ID_LENGTH} (${invalidProducts.join(', ')}). Please correct them before importing.`;
            this.showToast('Validation Error', message, 'error');
            return; 
        }

        importProducts({ products: productsToImport })
            .then(() => {
                this.showToast('Success', `${productsToImport.length} products imported successfully!`, 'success');
                // Clear selection
                this.selectedProductIds = new Set();
                this.allProducts = this.allProducts.map(p => ({ ...p, isSelected: false }));
                this.handleFilterChange({ target: { value: this.searchTerm } });
            })
            .catch(error => {
                const errorMessage = error.body && error.body.message 
                                ? error.body.message 
                                : (error.message || 'Unknown error during import.');
                
                console.error('Detailed Error Message (Apex/JS):', errorMessage);
                
                this.error = errorMessage;
                this.showToast('Import Error', errorMessage, 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    /**
     * Requirement 6: Opens the Detail Modal/Lightbox.
     * Fetches the product details (description) and displays the modal.
     */
    handleProductClick(event) {
        const productId = event.currentTarget.dataset.id;
        this.currentProductDetails = {}; // Clear previous details

        // Find the complete product object in the list
        const selectedProduct = this.allProducts.find(product => product.product_id === productId);
        this.currentProduct = selectedProduct;
        this.showDetailModal = true;
        
        // Apex callout to fetch the description
        getProductDetails({ product_Id: productId })
            .then(result => {
                // Populate the product details (description)
                this.currentProductDetails = result; 
            })
            .catch(error => {
                this.error = error.body ? error.body.message : 'Error fetching details.';
                this.showToast('Error', this.error, 'error');
                this.currentProductDetails = { description: 'Failed to load description.' };
            });
    }

    closeDetailModal() {
        this.showDetailModal = false;
        this.currentProduct = {};
        this.currentProductDetails = {};
    }

    // Helper to display Toast notifications
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(evt);
    }
}