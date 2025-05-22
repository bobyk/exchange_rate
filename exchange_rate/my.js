var loadPbFunc;
var loadMonoFunc;
var loadNbuFunc;
$(function () {
    var oConverter = new Converter();

    loadPbFunc = function () {
        var pbExchangeType = $('#pb-exchange-type').val();
        $.getJSON(
            'https://camface.quix.pw:2053/cors/https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=' + pbExchangeType,
            function (response) {
                chrome.storage.sync.set({'pbResponse': response}, function () {
                });
                buildRates($('#pb-rates'), response);
                oConverter.doConvert(); // Ensure conversion is updated
            }
        );
    }

    loadNbuFunc = function () {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const dd = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}${mm}${dd}`;

        $.getJSON(
            'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=' + formattedDate + '&json',
            function (response) {
                var result = [];
                let avalCodes = ['USD', 'EUR', 'PLN']; // Currency codes NBU uses
                for (let i in response) {
                    let rate = response[i];
                    if (avalCodes.includes(rate.cc)) {
                        result[result.length] = {
                            ccy: rate.cc,
                            buy: parseFloat(rate.rate), // NBU rate is in 'rate'
                            sale: null // Official rate, no separate sale rate
                        };
                    }
                }
                chrome.storage.sync.set({'nbuResponse': result}, function () {});
                buildRates($('#nbu-rates'), result);
                oConverter.doConvert(); // Ensure conversion is updated
            }
        );
    }

    loadMonoFunc = function () {
        $.getJSON(
            'https://api.monobank.ua/bank/currency',
            function (response) {
                let rates = response;

                let avalCodes = {840: 'USD', 980: 'UAH', 978: 'EUR', 985: 'PLN'};
                var result = [];
                for (let i in rates) {
                    let rate = rates[i];
                    if (rate.currencyCodeB != 980) continue;
                    let code = rate.currencyCodeA;
                    if (avalCodes[code] != undefined) {
                        result[result.length] = {
                            ccy: avalCodes[code],
                            buy: parseFloat(rate.rateBuy),
                            sale: parseFloat(rate.rateSell),
                        }
                    }
                }

                chrome.storage.sync.set({'monoResponse': result}, function () {
                });
                buildRates($('#mono-rates'), result);
                oConverter.doConvert(); // Ensure conversion is updated
            }
        );
    }

    window.setTimeout(function () {
        loadPbFunc();
    }, 1);

    window.setTimeout(function () {
        loadMonoFunc();
    }, 1);

    window.setTimeout(function () {
        loadNbuFunc();
    }, 1);

    window.setTimeout(function () {
        $.ajax({
            url: 'https://api.goverla.ua/graphql',
            method: "POST",
            dataType: 'json',
            contentType: "application/json",
            cache: false,
            data: JSON.stringify({
                operationName: "Point",
                query: "query Point($alias: Alias!) {\n  point(alias: $alias) {\n    rates {\n      id\n      currency {\n        alias\n        exponent\n        codeAlpha\n        __typename\n      }\n      bid {\n        absolute\n        __typename\n      }\n      ask {\n        absolute\n        __typename\n      }\n      __typename\n    }\n    updatedAt\n    __typename\n  }\n}\n",
                variables: {
                    alias: "goverla-ua"
                }
            })
        }).done(function (response) {
            //console.log(response);
            if (response.data.point.rates === undefined) {
                $('#tgoverla').hide();
                $('#goverla-rates').hide();
            }

            let rates = response.data.point.rates;
            var result = [];
            for (let i in rates) {
                let rate = rates[i];
                let code = rate.currency.codeAlpha;
                if (code == 'USD' || code == 'EUR' || code == 'PLN') {
                    result[result.length] = {
                        ccy: code,
                        buy: parseFloat(rate.bid.absolute) / 100,
                        sale: parseFloat(rate.ask.absolute) / 100,
                    }
                }
            }

            chrome.storage.sync.set({'goverlaResponse': result}, function () {
            });
            buildRates($('#goverla-rates'), result);
            oConverter.doConvert(); // Ensure conversion is updated
        });
    }, 1);

    function onLoaded() {
        chrome.storage.sync.get(['from', 'sum', 'rateCol', 'currency', 'pbExchangeType', 'pbResponse', 'monoResponse', 'goverlaResponse', 'nbuResponse'], function (items) {
            if (items.sum != undefined) {
                $('#converter :input[name="sum"]').val(items.sum).select();
            }

            if (items.pbResponse != undefined && items.pbResponse) {
                buildRates($('#pb-rates'), items.pbResponse);
            }

            if (items.monoResponse != undefined && items.monoResponse) {
                buildRates($('#mono-rates'), items.monoResponse);
            }

            if (items.goverlaResponse != undefined && items.goverlaResponse) {
                buildRates($('#goverla-rates'), items.goverlaResponse);
            }

            if (items.nbuResponse !== undefined && items.nbuResponse) {
                buildRates($('#nbu-rates'), items.nbuResponse);
            }

            if (items.from != undefined) {
                $('#converter option[value="' + items.from + '"]').attr('selected', true);
            }

            if (items.currency != undefined) {
                $('#currency option[value="' + items.currency + '"]').attr('selected', true);
            }

            if (items.rateCol != undefined && typeof (items.rateCol) != Object) {
                oConverter.rateCol = items.rateCol;

                for (var i in items.rateCol) {
                    $('input.rateCol[name=' + i + ']').each(function () {
                        if ($(this).val() == items.rateCol[i]) {
                            $(this).attr('checked', true);
                        }
                    });
                }
            }

            if (items.pbExchangeType != undefined) {
                $('#pb-exchange-type option[value="' + items.pbExchangeType + '"]').attr('selected', true);
                console.log('set option');
            }
            oConverter.doConvert();
        });
    };

    function buildRates(table, rates) {
        for (var i in rates) {
            var rate = rates[i];
            var tr = table.find('.' + rate.ccy);
            tr.find('td').remove();
            tr.append($('<td>' + rate.ccy + '</td>'));
            if (rate.sale !== null && rate.sale !== undefined && rate.sale !== '-') { // Check if sale rate exists
                tr.append($('<td>' + parseFloat(rate.buy).toFixed(2) + '</td>'));
                tr.append($('<td>' + parseFloat(rate.sale).toFixed(2) + '</td>'));
            } else {
                // For NBU, rate.buy holds the official rate.
                tr.append($('<td>' + parseFloat(rate.buy).toFixed(2) + '</td>'));
                tr.append($('<td>-</td>')); // Placeholder for the second column
            }
            tr.append($('<td class="converted">0</td>'));
        }
    };

});

function Converter() {
    var $this = this;

    $this.initSigns();

    $(document).on('change', 'input.rateCol', function (e) {
        $this.rateCol[$(this).attr('name')] = $(this).val();
        chrome.storage.sync.set({'rateCol': $this.rateCol}, function () {
        });
        $this.doConvert();
    });

    $this.pbExchangeType = $('#pb-exchange-type').on('change', function (e) {
        chrome.storage.sync.set({'pbExchangeType': $(this).val()}, function () {
            console.log($(this))
        });
        loadPbFunc();
        $this.doConvert();
    });

    $this.currency = $('#currency').on('change', function (e) {
        $this.doConvert();
        $('#input').focus();
        chrome.storage.sync.set({'currency': $(this).val()}, function () {
        });
    });

    $this.from = $('#converter :input[name="from"]').on('change', function (e) {
        $this.doConvert();
        chrome.storage.sync.set({'from': $(this).val()}, function () {
        });
    });

    $this.sum = $('#converter :input[name="sum"]').on('keyup', function (e) {
        $this.doConvert();
        chrome.storage.sync.set({'sum': $this.sum.val()}, function () {
        });
    });

    $('#converter :input[name="sum"]').on('keyup', function () {
        $this.calculate($(this).val());
    });
};
Converter.prototype.rateCol = {'goverla-rates': 1, 'pb-rates': 1, 'mono-rates': 1, 'nbu-rates': 1};
Converter.prototype.currency = 1;
Converter.prototype.sum = null;
Converter.prototype.from = null;
Converter.prototype.calculate = function ($val) {
    $val = $val.replace(',', '.');
    $val = removeInvalidCharacters($val);
    $val = calculateExpression($val)
    if ($val !== NaN) {
        this.setCalculatorResult($val);
    }

    return $val;
};

Converter.prototype.setCalculatorResult = function ($val) {
    $('#result').text(parseFloat($val).toFixed(2));
};

Converter.prototype.signs = [];
Converter.prototype.initSigns = function () {
    $this = this;

    if ($this.signs.length == 0) {
        $('#currency option').each(function () {
            $this.signs[$(this).attr('value')] = $(this).text();
        });
    }
};

Converter.prototype.doConvert = function () {
    $this = this;

    var $pbTable = $('#pb-rates, #mono-rates, #goverla-rates, #nbu-rates');

    $pbTable.each(function () {
        var $table = $(this);
        var tableId = $table.attr('id'); // Renamed from rateColIndex for clarity
        var effectiveRateCol;

        if (tableId === 'nbu-rates') {
            effectiveRateCol = 1; // NBU official rate is in the 2nd td (index 1)
        } else {
            effectiveRateCol = $this.rateCol[tableId];
        }

        var currenctCurrencyRateIndex = 0;
        var sum = $this.calculate($this.sum.val());


        if ($this.currency.val() != 'UAH') {
            currenctCurrencyRateIndex = $table.find('td:contains("' + $this.currency.val() + '")').parent().index();
            // Ensure the row was found, otherwise currentCurrencyRate might be NaN
            if (currenctCurrencyRateIndex > -1 && $table.find('tr').length > currenctCurrencyRateIndex) {
                 let currentCurrencyRateText = $($($table.find('tr')[currenctCurrencyRateIndex]).find('td')[effectiveRateCol]).text();
                 let currentCurrencyRate = parseFloat(currentCurrencyRateText);
                 if (!isNaN(currentCurrencyRate) && currentCurrencyRate > 0) {
                    sum = sum * currentCurrencyRate;
                 }
            }
        }

        $(this).find('tr').each(function () {
            let currentCurrencySign = $(this).find('td').first().text();
            currentCurrencySign = currentCurrencySign.substring(0, 3);
            if (currentCurrencySign == '') return;

            let currentRateText = $($(this).find('td')[effectiveRateCol]).text();
            let currentRate = parseFloat(currentRateText);
            let sign = $this.signs['UAH'];
            let currentSum = sum;

            // Ensure currentRate is a valid number before division
            if (!isNaN(currentRate) && currentRate > 0 && currenctCurrencyRateIndex != $(this).index()) {
                currentSum = sum / currentRate;
                sign = $this.signs[currentCurrencySign];
            } else if (currenctCurrencyRateIndex == $(this).index()) {
                // This is the currency we are converting from, sum is already in UAH equivalent or original sum if UAH
                sign = $this.signs[currentCurrencySign];
            } else {
                 // Could not get a valid rate, display 0 or error
                currentSum = 0;
                sign = $this.signs[currentCurrencySign];
            }


            currentSum = Number(currentSum.toFixed(2));
            $(this).find('td.converted').text(currentSum.toFixed(2) + ' ' + sign);
        });
    });
};

function removeInvalidCharacters(string) {
    return string.replace(/[^0-9\-\.\-\+\*\/\(\)\^]/gmsi, '');
}

function calculateExpression(expression) {
    // Tokenize the expression (allowing decimals)
    const tokens = expression.match(/([0-9]+(?:\.[0-9]*)?|\+|\-|\*|\/|\(|\))/g);

    // Shunting Yard algorithm to convert infix to RPN
    const outputQueue = [];
    const operatorStack = [];

    const precedence = {
        '+': 1,
        '-': 1,
        '*': 2,
        '/': 2,
    };

    tokens.forEach(token => {
        if (!isNaN(token)) {
            outputQueue.push(token);
        } else if (token === '(') {
            operatorStack.push(token);
        } else if (token === ')') {
            while (operatorStack.length && operatorStack[operatorStack.length - 1] !== '(') {
                outputQueue.push(operatorStack.pop());
            }
            operatorStack.pop(); // Discard the '('
        } else {
            while (
                operatorStack.length &&
                precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
                ) {
                outputQueue.push(operatorStack.pop());
            }
            operatorStack.push(token);
        }
    });

    while (operatorStack.length) {
        outputQueue.push(operatorStack.pop());
    }

    // Evaluate the RPN expression
    const resultStack = [];

    outputQueue.forEach(token => {
        if (!isNaN(token)) {
            resultStack.push(parseFloat(token));
        } else {
            const b = resultStack.pop();
            const a = resultStack.pop();
            switch (token) {
                case '+':
                    resultStack.push(a + b);
                    break;
                case '-':
                    resultStack.push(a - b);
                    break;
                case '*':
                    resultStack.push(a * b);
                    break;
                case '/':
                    resultStack.push(a / b);
                    break;
                default:
                    throw new Error('Invalid operator');
            }
        }
    });

    return resultStack.pop();
}