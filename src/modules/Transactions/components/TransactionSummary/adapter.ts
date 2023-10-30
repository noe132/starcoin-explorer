import { connect } from 'react-redux';
import { createSelector } from 'reselect';
// @ts-ignore
import createLoadingSelector from '@/rootStore/loading/selector';
import store from '@/Transactions/store';
import * as types from '@/Transactions/store/constants';
import Index from './index';

const { selector: currentSelector, actions } = store;

const selector = createSelector(
  currentSelector,
  (current) => ({
    selectedTransactions: current.selectedTransactions,
  }),
);

export default connect(selector, {
  addSelectedTransation: actions.addSelectedTransation,
  removeSelectedTransation: actions.removeSelectedTransation,
})(Index as any) as any;