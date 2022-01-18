var loadPbFunc;
$(function () {

    onLoaded();

    var oConverter = new Converter();

    loadPbFunc = function () {
        var pbExchangeType = $('#pb-exchange-type').val();

        $.getJSON(
            'https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=' + pbExchangeType,
            function (response) {
                console.log(response);
                buildRates($('#pb-rates'), response);
                onLoaded();
            }
        );
    }

    window.setTimeout(function () {
        loadPbFunc();
    }, 1);

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
        if (response.data.point.rates === undefined) {
            $('#tgoverla').hide();
            $('#goverla-rates').hide();
        }

        let rates = response.data.point.rates;
        var result = [];
        for(let i in rates) {
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

        console.log(result)
        buildRates($('#goverla-rates'), result);
        onLoaded();
    }).fail(function (jqXHR, textStatus) {});

    function onLoaded() {
        $("#loader").remove();
        $('#content').show();

        chrome.storage.sync.get(['from', 'sum', 'rateCol', 'currency', 'pbExchangeType'], function (items) {
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

            if (items.sum != undefined) {
                $('#converter :input[name="sum"]').val(items.sum).select();
            }

            if (items.pbExchangeType != undefined) {
                $('#pb-exchange-type option[value="' + items.pbExchangeType + '"]').attr('selected', true);
            }

            oConverter.doConvert();
        });
    };

    function buildRates(table, rates) {
        // table.find('tr').remove();
        for (var i in rates) {
            var rate = rates[i];

            var tr = table.find('.' + rate.ccy.toUpperCase());
            tr.find('td').remove();
            tr.append($('<td>' + rate.ccy.toUpperCase() + '</td>'));
            tr.append($('<td>' + parseFloat(rate.buy).toFixed(2) + '</td>'));
            tr.append($('<td>' + parseFloat(rate.sale).toFixed(2) + '</td>'));
            tr.append($('<td class="converted">0</td>'));
        }
    };

});

function Converter() {
    var $this = this;

    $this.initSigns();

    $(document).on('change', 'input.rateCol', function (e) {
        $this.rateCol[$(this).attr('name')] = $(this).val();
        console.log($this.rateCol);
        chrome.storage.sync.set({'rateCol': $this.rateCol}, function () {});
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
Converter.prototype.rateCol = {'goverla-rates': 1, 'pb-rates': 1};
Converter.prototype.currency = 1;
Converter.prototype.sum = null;
Converter.prototype.from = null;
Converter.prototype.calculate = function ($val) {
    $val = $val.replace(',', '.');
    eval("var answer = " + $val);

    this.setCalculatorResult(answer);

    return answer;
};

Converter.prototype.setCalculatorResult = function ($val) {
    $('#result').text($val.toFixed(2));
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

    var $pbTable = $('#pb-rates, #goverla-rates');

    $pbTable.each(function () {
        var $table = $(this);
        var rateColIndex = $table.attr('id');
        var currenctCurrencyRateIndex = 0;
        var sum = $this.calculate($this.sum.val());



        if ($this.currency.val() != 'UAH') {
            currenctCurrencyRateIndex = $table.find('td:contains("' + $this.currency.val() + '")').parent().index();
            var currentCurrencyRate = $($($table.find('tr')[currenctCurrencyRateIndex]).find('td')[$this.rateCol[rateColIndex]]).text();
            sum = sum * currentCurrencyRate;
        }

        $(this).find('tr').each(function () {
            var currentCurrencySign = $(this).find('td').first().text();
            currentCurrencySign = currentCurrencySign.substring(0, 3);
            if (currentCurrencySign == '') return;

            var currentRate = $($(this).find('td')[$this.rateCol[rateColIndex]]).text();
            var sign = $this.signs['UAH'];
            var currentSum = sum;
            if (currenctCurrencyRateIndex != $(this).index()) {
                currentSum = sum / currentRate;
                sign = $this.signs[currentCurrencySign];
            }

            currentSum = Number(currentSum.toFixed(2));

            // console.table({
            //     tab: rateColIndex,
            //     currency: currentCurrencySign,
            //     curRateIndex: currenctCurrencyRateIndex,
            //     rateCol: $this.rateCol[rateColIndex],
            //     currRate1: currentRate,
            //     sum: currentSum
            // });

            $(this).find('td.converted').text(currentSum.toFixed(2) + ' ' + sign);
        });
    });
};