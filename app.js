const MARKETS = ["billa", "hofer", "spar"];

let products = [];
let shoppingList = [];
let purchaseHistory = [];

const $ = (id) => document.getElementById(id);


/* 1. Produkte aus products.json laden */

async function loadProducts() {
    try {
        const response = await fetch("products.json");

        if (!response.ok) {
            throw new Error("products.json konnte nicht geladen werden.");
        }

        products = await response.json();
        fillProductSelect();
    } catch (error) {
        console.error(error);
        $("productSelect").innerHTML =
            '<option value="">Produkte konnten nicht geladen werden</option>';
        $("selectedCategory").textContent = "Fehler";
        $("selectedPrices").textContent =
            "Bitte die Website über einen Webserver öffnen.";
    }
}

function fillProductSelect() {
    const select = $("productSelect");

    select.innerHTML =
        '<option value="">Produkt auswählen...</option>';

    products.forEach((product) => {
        const option = document.createElement("option");
        option.value = product.id;
        option.textContent = product.name;
        select.appendChild(option);
    });
}


/* 2. Produktinformationen */

function updateProductInfo() {
    const productId = Number($("productSelect").value);
    const product = products.find((item) => item.id === productId);

    if (!product) {
        $("selectedCategory").textContent = "Noch kein Produkt";
        $("selectedPrices").textContent =
            "Bitte ein Produkt auswählen.";
        return;
    }

    $("selectedCategory").textContent = product.category;
    $("selectedPrices").textContent =
        `Billa €${formatPrice(product.prices.billa)} · ` +
        `Hofer €${formatPrice(product.prices.hofer)} · ` +
        `Spar €${formatPrice(product.prices.spar)}`;
}


/* 3. Produkte hinzufügen */

function addSelectedProduct() {
    const productId = Number($("productSelect").value);
    const quantity = Number($("quantity").value);

    const product = products.find((item) => item.id === productId);

    if (!product) {
        alert("Bitte zuerst ein Produkt auswählen.");
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
        alert("Die Menge muss zwischen 1 und 200 liegen.");
        return;
    }

    addToShoppingList(product, quantity);
}

function addCustomProduct() {
    const name = $("customName").value.trim();
    const category = $("customCategory").value.trim();

    const prices = {
        billa: Number($("customBilla").value),
        hofer: Number($("customHofer").value),
        spar: Number($("customSpar").value)
    };

    if (!name || !category) {
        alert("Bitte Produktname und Kategorie eingeben.");
        return;
    }

    if (!validPrice(prices.billa) ||
        !validPrice(prices.hofer) ||
        !validPrice(prices.spar)) {
        alert("Bitte für alle drei Supermärkte einen gültigen Preis zwischen 0 und 200 € eingeben.");
        return;
    }

    const customProduct = {
        id: `custom-${Date.now()}`,
        name,
        category,
        prices
    };

    addToShoppingList(customProduct, 1);

    $("customName").value = "";
    $("customCategory").value = "";
    $("customBilla").value = "";
    $("customHofer").value = "";
    $("customSpar").value = "";
}

function addToShoppingList(product, quantity) {
    const existing = shoppingList.find(
        (item) => item.product.id === product.id
    );

    if (existing) {
        existing.quantity += quantity;
    } else {
        shoppingList.push({ product, quantity });
    }

    renderShoppingList();
}


/* 4. Einkaufsliste anzeigen */

function renderShoppingList() {
    const container = $("shoppingList");

    if (shoppingList.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <div class="empty-icon">🛒</div>
                <strong>Noch keine Produkte</strong>
                <span>Wähle oben ein Produkt aus.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    shoppingList.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "item";

        row.innerHTML = `
            <div>
                <strong>${escapeHtml(item.product.name)}</strong>
                <small>${escapeHtml(item.product.category)}</small>
            </div>
            <div><small>Menge</small><br>${item.quantity}</div>
            <div><small>ab</small><br>€${formatPrice(getCheapestBasePrice(item.product))}</div>
            <div><small>möglicher Gesamtpreis</small><br>€${formatPrice(getCheapestBasePrice(item.product) * item.quantity)}</div>
            <button class="remove" data-index="${index}">Entfernen</button>
        `;

        container.appendChild(row);
    });

    container.querySelectorAll(".remove").forEach((button) => {
        button.addEventListener("click", () => {
            shoppingList.splice(Number(button.dataset.index), 1);
            renderShoppingList();
        });
    });
}


/* 5. Hauptalgorithmus */

function calculateBest() {
    if (shoppingList.length === 0) {
        alert("Bitte füge zuerst Produkte hinzu.");
        return;
    }

    const maxMarkets = Number($("maxMarkets").value);

    const discounts = {
        billa: getDiscount("discountBilla"),
        hofer: getDiscount("discountHofer"),
        spar: getDiscount("discountSpar")
    };

    const combinations = getMarketCombinations(maxMarkets);
    let bestResult = null;

    combinations.forEach((combination) => {
        const result = calculateCombination(combination, discounts);

        if (!bestResult || result.total < bestResult.total) {
            bestResult = result;
        }
    });

    const allMarketsResult = calculateCombination(MARKETS, discounts);

    bestResult.saving = Math.max(
        0,
        allMarketsResult.total - bestResult.total
    );

    showResult(bestResult);
    savePurchase(bestResult);
    renderStatistics();
}


/* 6. Erlaubte Supermarkt-Kombinationen */

function getMarketCombinations(maxMarkets) {
    const combinations = [];

    for (let mask = 1; mask < 8; mask++) {
        const combination = [];

        MARKETS.forEach((market, index) => {
            if (mask & (1 << index)) {
                combination.push(market);
            }
        });

        if (combination.length <= maxMarkets) {
            combinations.push(combination);
        }
    }

    return combinations;
}


/* 7. Kombination berechnen */

function calculateCombination(markets, discounts) {
    let total = 0;
    const allocation = [];

    shoppingList.forEach((item) => {
        let bestMarket = markets[0];
        let bestPrice = Infinity;

        markets.forEach((market) => {
            const originalPrice = item.product.prices[market];
            const discountMultiplier = 1 - discounts[market] / 100;
            const discountedPrice =
                originalPrice * discountMultiplier;

            if (discountedPrice < bestPrice) {
                bestPrice = discountedPrice;
                bestMarket = market;
            }
        });

        const itemTotal = bestPrice * item.quantity;

        total += itemTotal;

        allocation.push({
            name: item.product.name,
            quantity: item.quantity,
            market: bestMarket,
            price: bestPrice,
            total: itemTotal
        });
    });

    return {
        markets,
        total,
        allocation,
        saving: 0
    };
}


/* 8. Ergebnis anzeigen */

function showResult(result) {
    $("resultCard").classList.remove("hidden");

    $("totalResult").textContent =
        `€${formatPrice(result.total)}`;

    $("productCountResult").textContent =
        getTotalProductCount();

    $("savingResult").textContent =
        `€${formatPrice(result.saving)}`;

    $("marketCountResult").textContent =
        new Set(result.allocation.map((item) => item.market)).size;

    showBudgetStatus(result.total);
    showAllocation(result.allocation);

    $("resultCard").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function showAllocation(allocation) {
    const container = $("allocationResult");
    container.innerHTML = "";

    allocation.forEach((item) => {
        const row = document.createElement("div");
        row.className = "result-row";

        row.innerHTML = `
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${item.quantity} ×</small>
            </div>
            <div>${marketName(item.market)}</div>
            <div>€${formatPrice(item.price)}</div>
            <div><strong>€${formatPrice(item.total)}</strong></div>
        `;

        container.appendChild(row);
    });
}

function showBudgetStatus(total) {
    const budget = Number($("budget").value);
    const status = $("budgetStatus");

    if (!budget) {
        status.textContent = "Kein Budget angegeben";
        status.className = "status";
        return;
    }

    if (total <= budget) {
        status.textContent =
            `✓ Budget eingehalten · €${formatPrice(budget - total)} übrig`;
        status.className = "status ok";
    } else {
        status.textContent =
            `⚠ Budget um €${formatPrice(total - budget)} überschritten`;
        status.className = "status bad";
    }
}


/* 9. Statistik */

function savePurchase(result) {
    purchaseHistory.push({
        total: result.total,
        productCount: getTotalProductCount(),
        date: new Date().toISOString()
    });

    localStorage.setItem(
        "smartGroceryHistory",
        JSON.stringify(purchaseHistory)
    );
}

function loadStatistics() {
    try {
        const saved =
            localStorage.getItem("smartGroceryHistory");

        purchaseHistory = saved ? JSON.parse(saved) : [];
    } catch {
        purchaseHistory = [];
    }

    renderStatistics();
}

function renderStatistics() {
    const count = purchaseHistory.length;

    if (count === 0) {
        $("averageSpend").textContent = "€0,00";
        $("averageProducts").textContent = "0";
        $("purchaseCount").textContent = "0";
        $("totalSpend").textContent = "€0,00";
        return;
    }

    const totalSpend = purchaseHistory.reduce(
        (sum, purchase) => sum + purchase.total,
        0
    );

    const totalProducts = purchaseHistory.reduce(
        (sum, purchase) => sum + purchase.productCount,
        0
    );

    $("averageSpend").textContent =
        `€${formatPrice(totalSpend / count)}`;

    $("averageProducts").textContent =
        (totalProducts / count).toFixed(1);

    $("purchaseCount").textContent = count;
    $("totalSpend").textContent =
        `€${formatPrice(totalSpend)}`;
}


/* 10. Hilfsfunktionen */

function getDiscount(id) {
    const value = Number($(id).value);
    return Number.isNaN(value)
        ? 0
        : Math.min(100, Math.max(0, value));
}

function validPrice(price) {
    return Number.isFinite(price) &&
        price >= 0 &&
        price <= 200;
}

function getCheapestBasePrice(product) {
    return Math.min(
        ...MARKETS.map(
            (market) => product.prices[market]
        )
    );
}

function getTotalProductCount() {
    return shoppingList.reduce(
        (sum, item) => sum + item.quantity,
        0
    );
}

function marketName(market) {
    return {
        billa: "Billa",
        hofer: "Hofer",
        spar: "Spar"
    }[market];
}

function formatPrice(value) {
    return Number(value).toFixed(2).replace(".", ",");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* 11. Buttons */

$("productSelect").addEventListener(
    "change",
    updateProductInfo
);

$("addProduct").addEventListener(
    "click",
    addSelectedProduct
);

$("addCustomProduct").addEventListener(
    "click",
    addCustomProduct
);

$("calculate").addEventListener(
    "click",
    calculateBest
);

$("clearList").addEventListener(
    "click",
    () => {
        shoppingList = [];
        renderShoppingList();
        $("resultCard").classList.add("hidden");
    }
);


/* 12. Start */

loadProducts();
loadStatistics();
renderShoppingList();
