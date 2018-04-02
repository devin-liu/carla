const DB = require('../datafeed/Database/index.js');
const ExchangeWorld = require('./ExchangeWorld.js');
const QLearner = require('./q-learner.js');
const Gdax = require('gdax');
const publicClient = new Gdax.PublicClient();
const Trainer = require('./train.js');
const authedClient = require('./TradeActions.js');

class Trader extends Trainer {
  constructor(agent, world, symbol) {
    super(agent, world, symbol)
    this.setNextState = this.setNextState.bind(this);
    this.takeTradeAction = this.takeTradeAction.bind(this);
    this.runTradingPoller = this.runTradingPoller.bind(this);
  }

  addBuyPosition(price, size) {
    console.log(`BUYING ${size} @ ${price}` )
    // this.world.takeStep('BUY', size)
    authedClient.buy({ price, size, product_id: this.world.symbol }, (error, response) => {
        this.world.takeStep('BUY', size)
    })

  }
  addSellPosition(price, size) {
    console.log(`SELLING ${size} @ ${price}` )
    // this.world.takeStep('SELL', size)
    authedClient.sell({ price, size, product_id: this.world.symbol }, (error, response) => {
      this.world.takeStep('SELL', size)
    })
  }

  takeTradeAction(currentState) {
    const currentStateAction = this.agent.Q[currentState.id];
    const bestAction = this.agent.pickBestAction(currentStateAction)
    const quantity = this.world.getTradeQuantity(bestAction);
    if(bestAction === 'BUY'){
      this.addBuyPosition(this.world.getAskPrice(), quantity);
    }

    if(bestAction === 'SELL'){
      this.addSellPosition(this.world.getBidPrice(), quantity);
    }
  }

  runTradingPoller() {
    setTimeout(() => {
      this.getNextOrder()
      .then(this.takeTradeAction)
      .catch(e => console.log(e))
      this.runTradingPoller();
    }, 3000)
  }

  getStepAction() {
    const nextAction = this.agent.pickBestAction(this.stepState);

  }

  setNextState(orderBook) {
    const { marketBids, marketAsks, stateId } = this.world.parseOrderBook(orderBook);
    console.log(`Current World State: ${stateId}`)
    console.log(`holdQuanitity: ${this.world.holdQuantity}`)
    this.setNewWorldOrderBook({orderBook, marketAsks, marketBids});
    this.stepState = this.getNewStepState(stateId);
    return this.stepState;
  }



  getNextOrder() {
    return new Promise((resolve, reject) => {
      publicClient.getProductOrderBook(
        this.world.symbol,
        { level: 2 },
        (error, response, orderBook) => {
          if(!error){
            resolve(this.setNextState(orderBook))

          }else{
            console.log(error)
            reject(error)
          }
        }
      )
    })
  }

  getFirstOrder() {
    return new Promise((resolve, reject) => {
      publicClient.getProductOrderBook(
        this.world.symbol,
        { level: 2 },
        (error, response, orderBook) => {
          if(!error){
            this.world.firstVWAP = orderBook.asks[0][0];
            console.log(this.world.firstVWAP)
            resolve(this.world.firstVWAP);
          }else{
            console.log(error)
          }
        }
      )
    })
  }

  init() {
    DB.query(`select * from qmap where profit=(SELECT max(profit) from qmap);`, (error, response) => {
      const { currentAgent, currentWorld } = response.rows[0].data;
      this.agent.reset();
      this.world.reset();
      // this.agent.Q = currentAgent.Q;
      console.log(this.agent.Q)
      this.getFirstOrder()
      .then(this.runTradingPoller)

    })
  }
}


const world = new ExchangeWorld(5, 'ETH-USD', null, {});
const agent = new QLearner(world);
const pair_string = 'ETH-USD';

const tradingAgent = new Trader(agent, world, pair_string);
tradingAgent.init();